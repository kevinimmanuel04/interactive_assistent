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
  speechThreshold: 0.035,
  silenceThreshold: 0.02,
  speechHangMs: 180,
  silenceHangMs: 700,
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

  async start(): Promise<void> {
    if (this.stream) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
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
    for (const cb of this.listeners) cb(evt);
  }
}

export const vadMonitor = new VadMonitor();
