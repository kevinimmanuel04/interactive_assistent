// Glue between frontend VAD, backend recorder + whisper, and chat.
//
// Lifecycle while enabled:
//   1. VAD monitors the mic (getUserMedia).
//   2. speech-start → interrupt any ongoing TTS + pending generation
//      and call backend start_recording (cpal begins capturing).
//   3. speech-end → call backend stop_recording, which runs Whisper.
//   4. Apply wake-word gate (if configured) and send the transcript
//      through the normal chat pipeline.
//
// Error handling: any backend error just logs and the controller stays
// armed for the next utterance — we must never deadlock the listener.

import {
  cancelGeneration,
  cancelRecording,
  startRecording,
  stopRecording,
} from "./api";
import { lipSync } from "./lipsync";
import { vadMonitor } from "./vad";

interface ControllerOpts {
  getWakeWord: () => string | null;
  getInputDevice?: () => string | null;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onTranscript?: (text: string) => void;
  onIgnored?: (text: string, reason: "wake-word" | "empty") => void;
  onError?: (err: unknown) => void;
}

export class ListenController {
  private unsubscribe: (() => void) | null = null;
  private opts: ControllerOpts;
  private recording = false;

  constructor(opts: ControllerOpts) {
    this.opts = opts;
  }

  isEnabled(): boolean {
    return this.unsubscribe !== null;
  }

  async enable(): Promise<void> {
    if (this.unsubscribe) return;
    await vadMonitor.start(this.opts.getInputDevice?.() ?? null);
    this.unsubscribe = vadMonitor.on((evt) => {
      if (evt === "speech-start") this.onStart();
      else this.onEnd();
    });
  }

  async disable(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    vadMonitor.stop();
    if (this.recording) {
      this.recording = false;
      await cancelRecording().catch(() => {});
    }
  }

  private async onStart(): Promise<void> {
    // Barge-in: kill any current TTS + generation so the assistant listens.
    lipSync.stop();
    cancelGeneration().catch(() => {});
    this.opts.onSpeechStart?.();

    if (this.recording) return;
    try {
      await startRecording();
      this.recording = true;
    } catch (err) {
      this.recording = false;
      this.opts.onError?.(err);
    }
  }

  private async onEnd(): Promise<void> {
    this.opts.onSpeechEnd?.();
    if (!this.recording) return;
    this.recording = false;
    try {
      const raw = await stopRecording();
      const text = raw.trim();
      if (!text) {
        this.opts.onIgnored?.("", "empty");
        return;
      }
      const gated = applyWakeWord(text, this.opts.getWakeWord());
      if (gated === null) {
        this.opts.onIgnored?.(text, "wake-word");
        return;
      }
      this.opts.onTranscript?.(gated);
    } catch (err) {
      this.opts.onError?.(err);
    }
  }
}

/** Returns the message stripped of the wake-word prefix, or `null` if the
 *  wake word is required but not present. Empty/absent wake word passes through. */
export function applyWakeWord(text: string, wakeWord: string | null): string | null {
  if (!wakeWord || !wakeWord.trim()) return text;
  const needle = wakeWord.trim().toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx === -1) return null;
  // Strip everything up to and including the wake word + common punctuation.
  const after = text.slice(idx + needle.length).replace(/^[\s,.\-!?:;]+/, "");
  return after.length > 0 ? after : text;
}
