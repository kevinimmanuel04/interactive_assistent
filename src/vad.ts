// Energy-based voice activity detector.
//
// Opens the mic via getUserMedia (for *monitoring* only — the actual capture
// for Whisper happens on the backend via cpal), runs it through an
// AnalyserNode, and emits `speech-start` / `speech-end` events once the
// short-term RMS crosses configurable thresholds for long enough to debounce
// transient noise.
//
// This is deliberately simple (no webrtc-vad, no ONNX Silero) because Phase 2D
// just needs a reliable gate for push-to-talk + barge-in. Heavier models can
// drop in later behind the same `VadMonitor` interface.

export type VadEvent = "speech-start" | "speech-end";

export interface VadOptions {
  /** RMS level above which a frame counts as "speech". Tune for mic gain. */
  speechThreshold?: number;
  /** RMS level below which a frame counts as silence. Hysteresis gap. */
  silenceThreshold?: number;
  /** Consecutive ms above speechThreshold to confirm speech start. */
  speechHangMs?: number;
  /** Consecutive ms below silenceThreshold to confirm speech end. */
  silenceHangMs?: number;
}

const DEFAULTS: Required<VadOptions> = {
  // Lowered: with browser noiseSuppression+autoGainControl typical speech
  // RMS sits around 0.04–0.12 and idle noise around 0.005–0.012, so 0.022
  // gives reliable triggering without false positives.
  speechThreshold: 0.022,
  silenceThreshold: 0.012,
  speechHangMs: 140,
  silenceHangMs: 600,
};

type Listener = (evt: VadEvent) => void;

export class VadMonitor {
  private opts: Required<VadOptions>;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private rafId: number | null = null;
  private speaking = false;
  private aboveSinceMs = 0;
  private belowSinceMs = 0;
  private listeners = new Set<Listener>();
  private lastRmsLogMs = 0;
  private rmsPeak = 0;

  constructor(opts: VadOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  on(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  isRunning(): boolean {
    return this.stream !== null;
  }

  async start(preferredDeviceLabel?: string | null): Promise<void> {
    if (this.stream) return;
    let deviceId: string | undefined;
    if (preferredDeviceLabel && preferredDeviceLabel.trim()) {
      try {
        // Need at least one prior getUserMedia to populate labels; this call
        // is also a permission probe.
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        const devs = await navigator.mediaDevices.enumerateDevices();
        const wanted = preferredDeviceLabel.trim().toLowerCase();
        const match = devs.find(
          (d) =>
            d.kind === "audioinput" &&
            d.label.toLowerCase().includes(wanted),
        );
        if (match) {
          deviceId = match.deviceId;
          console.log(
            `[vad] using input device "${match.label}" (id=${match.deviceId.slice(0, 8)}…)`,
          );
        } else {
          console.warn(
            `[vad] preferred device "${preferredDeviceLabel}" not found, ` +
              `falling back to browser default. Available inputs:`,
            devs.filter((d) => d.kind === "audioinput").map((d) => d.label),
          );
        }
        for (const t of probe.getTracks()) t.stop();
      } catch (err) {
        console.warn("[vad] device enumeration failed:", err);
      }
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const tracks = stream.getAudioTracks();
    if (tracks.length > 0) {
      const t = tracks[0];
      console.log(
        `[vad] mic track: label="${t.label}" muted=${t.muted} ` +
          `enabled=${t.enabled} readyState=${t.readyState}`,
      );
      t.onmute = () => console.warn("[vad] mic track muted by OS/browser");
      t.onunmute = () => console.log("[vad] mic track unmuted");
      t.onended = () => console.warn("[vad] mic track ended");
    }
    const Ctor =
      (window.AudioContext as typeof AudioContext | undefined) ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.3;
    src.connect(analyser);

    this.stream = stream;
    this.ctx = ctx;
    this.analyser = analyser;
    this.buf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    this.speaking = false;
    this.aboveSinceMs = 0;
    this.belowSinceMs = 0;
    this.lastRmsLogMs = 0;
    this.rmsPeak = 0;

    const tick = (t: number) => {
      if (!this.analyser || !this.buf) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) {
        const s = this.buf[i];
        sum += s * s;
      }
      const rms = Math.sqrt(sum / this.buf.length);
      this.step(rms, t);
      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.analyser = null;
    this.buf = null;
    if (this.speaking) {
      this.speaking = false;
      this.emit("speech-end");
    }
  }

  private step(rms: number, nowMs: number): void {
    const { speechThreshold, silenceThreshold, speechHangMs, silenceHangMs } =
      this.opts;

    // Periodic level log for diagnostics: peak RMS over the last ~500 ms,
    // so the user can verify that VAD actually receives audio from the mic.
    if (rms > this.rmsPeak) this.rmsPeak = rms;
    if (this.lastRmsLogMs === 0) this.lastRmsLogMs = nowMs;
    if (nowMs - this.lastRmsLogMs >= 500) {
      console.log(
        `[vad] level peak=${this.rmsPeak.toFixed(4)} ` +
          `(speech≥${speechThreshold} silence≤${silenceThreshold}) ` +
          `state=${this.speaking ? "speaking" : "idle"}`,
      );
      this.rmsPeak = 0;
      this.lastRmsLogMs = nowMs;
    }

    if (!this.speaking) {
      if (rms >= speechThreshold) {
        if (this.aboveSinceMs === 0) this.aboveSinceMs = nowMs;
        if (nowMs - this.aboveSinceMs >= speechHangMs) {
          this.speaking = true;
          this.belowSinceMs = 0;
          this.emit("speech-start");
        }
      } else {
        this.aboveSinceMs = 0;
      }
    } else {
      if (rms <= silenceThreshold) {
        if (this.belowSinceMs === 0) this.belowSinceMs = nowMs;
        if (nowMs - this.belowSinceMs >= silenceHangMs) {
          this.speaking = false;
          this.aboveSinceMs = 0;
          this.emit("speech-end");
        }
      } else {
        this.belowSinceMs = 0;
      }
    }
  }

  private emit(evt: VadEvent): void {
    if (typeof console !== "undefined") {
      console.log("[vad]", evt);
    }
    for (const cb of this.listeners) cb(evt);
  }
}

export const vadMonitor = new VadMonitor();
