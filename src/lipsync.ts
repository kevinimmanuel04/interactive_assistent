// Hybrid playback:
//   - HTMLAudioElement plays a Blob object-URL built from raw WAV bytes
//     (read from a temp file via the `read_tts_bytes` command). This is
//     the same path the browser uses for <audio src="blob:..."> — no
//     base64 data URL, no Web Audio resampling, no WebView2 artefacts.
//   - Web Audio (OfflineAudioContext) is used ONLY to pre-compute an RMS
//     envelope from the decoded PCM and drive the Live2D mouth in sync
//     with <audio>.currentTime. The analyser is never connected to output.

import { invoke } from "@tauri-apps/api/core";

type Listener = (level: number) => void;

const SMOOTH_ATTACK = 0.35;
const SMOOTH_RELEASE = 0.18;
const GAIN = 3.2;
const FLOOR = 0.02;
const ENV_HOP_MS = 20; // envelope sample period

class LipSyncBus {
  private el: HTMLAudioElement | null = null;
  private envelope: Float32Array | null = null; // one value per ENV_HOP_MS
  private durationSec = 0;
  private rafId: number | null = null;
  private listeners = new Set<Listener>();
  private smoothed = 0;
  private preferredSinkId: string | null = null;
  private lastPlayedKey: string | null = null;
  private lastPlayedAt = 0;
  private playToken = 0;
  private volume = 1;

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(2, v));
    if (this.el) this.el.volume = Math.min(1, this.volume);
  }

  setSinkId(sinkId: string | null): void {
    this.preferredSinkId = sinkId && sinkId.length > 0 ? sinkId : null;
    const el = this.el as unknown as { setSinkId?: (id: string) => Promise<void> } | null;
    if (el && typeof el.setSinkId === "function") {
      el.setSinkId(this.preferredSinkId ?? "").catch((e) => {
        console.warn("[tts] audio.setSinkId failed:", e);
      });
    }
  }

  async play(payload: string): Promise<void> {
    // Payload is now a file path (temp WAV) emitted by `emit_tts_wav`.
    // De-dup against the same path arriving twice within a short window.
    const key = payload;
    const now = performance.now();
    if (key === this.lastPlayedKey && now - this.lastPlayedAt < 1500) {
      return;
    }
    this.lastPlayedKey = key;
    this.lastPlayedAt = now;

    const token = ++this.playToken;
    this.stop();

    // Read bytes via Tauri IPC (raw u8 Response, no JSON/base64 overhead).
    let bytes: ArrayBuffer;
    try {
      const resp = await invoke<ArrayBuffer | Uint8Array>("read_tts_bytes", {
        path: payload,
      });
      // Tauri 2 may return Uint8Array depending on platform; normalize.
      if (resp instanceof ArrayBuffer) {
        bytes = resp;
      } else if (resp instanceof Uint8Array) {
        bytes = resp.buffer.slice(
          resp.byteOffset,
          resp.byteOffset + resp.byteLength,
        ) as ArrayBuffer;
      } else {
        // Some Tauri builds wrap raw bytes in an ArrayBufferView-like object.
        const view = new Uint8Array(resp as ArrayBufferLike);
        bytes = view.buffer.slice(
          view.byteOffset,
          view.byteOffset + view.byteLength,
        ) as ArrayBuffer;
      }
      console.log(
        `[tts] read ${bytes.byteLength} bytes from ${payload.split(/[\\/]/).pop()}`,
      );
    } catch (err) {
      console.warn("[tts] read_tts_bytes failed:", err);
      return;
    }
    if (token !== this.playToken) return;

    // 1) Pre-compute envelope off the audio path.
    try {
      const OfflineCtor =
        (window.OfflineAudioContext as typeof OfflineAudioContext | undefined) ??
        (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
      const probe = new OfflineCtor(1, 1, 22050);
      const buffer = await probe.decodeAudioData(bytes.slice(0));
      this.envelope = computeEnvelope(buffer, ENV_HOP_MS);
      this.durationSec = buffer.duration;
      let envMax = 0;
      for (let i = 0; i < this.envelope.length; i++) {
        if (this.envelope[i] > envMax) envMax = this.envelope[i];
      }
      console.log(
        `[tts] envelope ready: ${this.envelope.length} hops, ` +
          `duration=${this.durationSec.toFixed(2)}s, ` +
          `peak rms=${envMax.toFixed(4)} (gain=${GAIN}, floor=${FLOOR})`,
      );
    } catch (err) {
      console.warn("[tts] envelope decode failed:", err);
      this.envelope = null;
      this.durationSec = 0;
    }

    if (token !== this.playToken) return;

    // 2) Play via blob object-URL on a fresh <audio> element.
    const blob = new Blob([bytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const el = new Audio();
    if (this.preferredSinkId) {
      const maybe = el as unknown as { setSinkId?: (id: string) => Promise<void> };
      if (typeof maybe.setSinkId === "function") {
        maybe.setSinkId(this.preferredSinkId).catch(() => {});
      }
    }
    el.src = url;
    el.preload = "auto";
    el.volume = Math.min(1, this.volume);
    const cleanup = () => {
      URL.revokeObjectURL(url);
    };
    el.onended = () => {
      cleanup();
      if (this.el === el) {
        this.el = null;
        this.stopLoop();
      }
    };
    el.onerror = (e) => {
      console.warn("[tts] audio element error:", e);
      cleanup();
      if (this.el === el) {
        this.el = null;
        this.stopLoop();
      }
    };
    this.el = el;
    try {
      await el.play();
    } catch (err) {
      console.warn("[tts] audio.play() failed:", err);
      cleanup();
      this.el = null;
      return;
    }
    this.startLoop();
  }

  stop(): void {
    if (this.el) {
      try {
        this.el.onended = null;
        this.el.onerror = null;
        this.el.pause();
        this.el.src = "";
      } catch { /* ignore */ }
      this.el = null;
    }
    this.stopLoop();
    this.emit(0);
  }

  private startLoop(): void {
    if (this.rafId !== null) return;
    console.log(
      `[tts] startLoop: ${this.listeners.size} subscriber(s), ` +
        `env=${this.envelope ? `${this.envelope.length} hops` : "null"}, ` +
        `durationSec=${this.durationSec.toFixed(2)}`,
    );
    let lastLogAt = 0;
    let peakLevel = 0;
    const tick = () => {
      const el = this.el;
      const env = this.envelope;
      if (!el || !env || this.durationSec <= 0) { this.rafId = null; return; }
      const t = el.currentTime;
      const idx = Math.min(env.length - 1, Math.max(0, Math.floor((t * 1000) / ENV_HOP_MS)));
      const rms = env[idx];
      let level = Math.min(1, Math.max(0, (rms - FLOOR) * GAIN));
      level = Math.pow(level, 0.7);
      const k = level > this.smoothed ? SMOOTH_ATTACK : SMOOTH_RELEASE;
      this.smoothed += (level - this.smoothed) * k;
      this.emit(this.smoothed);
      const now = performance.now();
      if (this.smoothed > peakLevel) peakLevel = this.smoothed;
      if (lastLogAt === 0) lastLogAt = now;
      if (now - lastLogAt >= 1000) {
        console.log(
          `[tts] mouth t=${t.toFixed(2)}s peak_level=${peakLevel.toFixed(3)}`,
        );
        peakLevel = 0;
        lastLogAt = now;
      }
      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    const decay = () => {
      this.smoothed *= 1 - SMOOTH_RELEASE;
      this.emit(this.smoothed);
      if (this.smoothed > 0.001 && this.el === null && this.rafId === null) {
        window.requestAnimationFrame(decay);
      } else {
        this.smoothed = 0;
        this.emit(0);
      }
    };
    window.requestAnimationFrame(decay);
  }

  private emit(level: number): void {
    for (const cb of this.listeners) cb(level);
  }
}

/** Compute per-hop RMS envelope from an AudioBuffer (mono-mixed). */
function computeEnvelope(buf: AudioBuffer, hopMs: number): Float32Array {
  const sr = buf.sampleRate;
  const hop = Math.max(1, Math.floor((sr * hopMs) / 1000));
  const frames = Math.max(1, Math.ceil(buf.length / hop));
  const env = new Float32Array(frames);
  const channels = buf.numberOfChannels;
  // Pull channel data once.
  const data: Float32Array[] = [];
  for (let c = 0; c < channels; c++) data.push(buf.getChannelData(c));
  for (let f = 0; f < frames; f++) {
    const start = f * hop;
    const end = Math.min(buf.length, start + hop);
    let sum = 0;
    let n = 0;
    for (let i = start; i < end; i++) {
      let s = 0;
      for (let c = 0; c < channels; c++) s += data[c][i];
      s /= channels;
      sum += s * s;
      n++;
    }
    env[f] = n > 0 ? Math.sqrt(sum / n) : 0;
  }
  return env;
}

export const lipSync = new LipSyncBus();

