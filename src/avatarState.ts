/**
 * Avatar state machine.
 *
 * A tiny reactive store that exposes the current high-level mode and
 * emotion so Live2DCanvas (and the SVG placeholder) can react without
 * each consumer reaching into chat internals.
 *
 * States map to the TZ "Idle / Listening / Thinking / Speaking /
 * Emotions" state machine; emotion is a separate, orthogonal axis so a
 * Speaking+happy state makes sense.
 */

import { detectEmotion, Emotion } from "./emotion";

export type AvatarMode = "idle" | "listening" | "thinking" | "speaking";

export interface AvatarState {
  mode: AvatarMode;
  emotion: Emotion;
}

type Listener = (state: AvatarState) => void;

class AvatarStateStore {
  private state: AvatarState = { mode: "idle", emotion: "neutral" };
  private listeners = new Set<Listener>();
  private idleTimer: number | null = null;

  get current(): AvatarState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Drop any pending automatic transition (e.g. speaking → idle). */
  private cancelPendingIdle() {
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private set(next: Partial<AvatarState>) {
    const merged = { ...this.state, ...next };
    if (merged.mode === this.state.mode && merged.emotion === this.state.emotion) {
      return;
    }
    this.state = merged;
    for (const fn of this.listeners) fn(this.state);
  }

  setListening(on: boolean) {
    this.cancelPendingIdle();
    if (on) {
      this.set({ mode: "listening" });
    } else if (this.state.mode === "listening") {
      this.set({ mode: "idle" });
    }
  }

  /** User submitted; we're waiting for the first token. */
  setThinking() {
    this.cancelPendingIdle();
    this.set({ mode: "thinking", emotion: "thinking" });
  }

  /**
   * Called on each streamed token. Transitions into Speaking on the first
   * token and reclassifies emotion from the full running text.
   */
  onToken(runningText: string) {
    this.cancelPendingIdle();
    const emotion = detectEmotion(runningText);
    this.set({ mode: "speaking", emotion });
  }

  /** Streaming finished — fall back to idle after a short grace period. */
  onDone(graceMs = 2500) {
    this.cancelPendingIdle();
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      // Keep the emotion around briefly so the expression lingers after the
      // bubble disappears, then revert to neutral on the next real event.
      this.set({ mode: "idle" });
    }, graceMs);
  }

  /** Hard reset (e.g. user cleared the conversation). */
  reset() {
    this.cancelPendingIdle();
    this.set({ mode: "idle", emotion: "neutral" });
  }
}

export const avatarState = new AvatarStateStore();
