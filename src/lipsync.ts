// Web Audio playback + RMS envelope extraction for Live2D lip-sync.
//
// Exposes a singleton that:
//   • plays a base64 data URL WAV via an AudioBufferSourceNode
//   • routes it through an AnalyserNode to compute instantaneous RMS
//   • exposes a subscribe(cb) API that delivers mouth-open values in [0, 1]
//
// The RMS → mouth mapping uses a light compressor (log-like curve + gain)
// to keep quiet vowels visible without clipping consonants.

type Listener = (level: number) => void;

const SMOOTH_ATTACK = 0.35; // how fast the mouth opens
const SMOOTH_RELEASE = 0.18; // how fast it closes
const GAIN = 3.2; // RMS is usually small; boost before clamp
const FLOOR = 0.02; // ignore background noise

class LipSyncBus {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private current: AudioBufferSourceNode | null = null;
  private rafId: number | null = null;
  private listeners = new Set<Listener>();
  private smoothed = 0;

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Play a base64 WAV data URL. Interrupts any currently playing clip. */
  async play(dataUrl: string): Promise<void> {
    const ctx = this.ensureContext();
    // Resume on user gesture — browsers suspend AudioContexts until user
    // interaction. Tauri's main window usually counts as focused, so this
    // is effectively a no-op in normal operation.
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }

    const resp = await fetch(dataUrl);
    const bytes = await resp.arrayBuffer();
    const audio = await ctx.decodeAudioData(bytes.slice(0));

    this.stop();
    const src = ctx.createBufferSource();
    src.buffer = audio;
    src.connect(this.analyser!);
    this.analyser!.connect(ctx.destination);

    src.onended = () => {
      if (this.current === src) {
        this.current = null;
        this.stopLoop();
      }
    };

    this.current = src;
    src.start();
    this.startLoop();
  }

  stop(): void {
    if (this.current) {
      try {
        this.current.onended = null;
        this.current.stop();
      } catch {
        /* already stopped */
      }
      this.current = null;
    }
    this.stopLoop();
    this.emit(0);
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        (window.AudioContext as typeof AudioContext | undefined) ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.0; // we do our own smoothing
      this.buf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    }
    return this.ctx;
  }

  private startLoop(): void {
    if (this.rafId !== null) return;
    const tick = () => {
      if (!this.analyser || !this.buf) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      // RMS of the current frame
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) {
        const s = this.buf[i];
        sum += s * s;
      }
      const rms = Math.sqrt(sum / this.buf.length);
      // Compressor-ish curve: boost + soft clip + floor gate
      let level = Math.min(1, Math.max(0, (rms - FLOOR) * GAIN));
      // Perceptual curve — mouths look more natural with a gentle gamma.
      level = Math.pow(level, 0.7);
      // Asymmetric smoothing: open fast, close slow.
      const k = level > this.smoothed ? SMOOTH_ATTACK : SMOOTH_RELEASE;
      this.smoothed += (level - this.smoothed) * k;
      this.emit(this.smoothed);
      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // Decay to zero so the mouth closes even after the clip ends.
    const decay = () => {
      this.smoothed *= 1 - SMOOTH_RELEASE;
      this.emit(this.smoothed);
      if (this.smoothed > 0.001 && this.current === null && this.rafId === null) {
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

export const lipSync = new LipSyncBus();
