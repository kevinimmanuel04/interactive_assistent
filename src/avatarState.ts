/**
 * Avatar state machine with emotion & user context tracking.
 *
 * Exposes current mode, emotion, user prompt context, and activity timestamp.
 */

import { detectEmotion, Emotion } from "./emotion";

export type AvatarMode = "idle" | "listening" | "thinking" | "speaking";

export interface AvatarState {
  mode: AvatarMode;
  emotion: Emotion;
  userPrompt: string;
  lastActivity: number;
}

type Listener = (state: AvatarState) => void;

class AvatarStateStore {
  private state: AvatarState = {
    mode: "idle",
    emotion: "neutral",
    userPrompt: "",
    lastActivity: Date.now(),
  };
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

  private cancelPendingIdle() {
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private set(next: Partial<AvatarState>) {
    const merged = { ...this.state, ...next };
    if (
      merged.mode === this.state.mode &&
      merged.emotion === this.state.emotion &&
      merged.userPrompt === this.state.userPrompt &&
      merged.lastActivity === this.state.lastActivity
    ) {
      return;
    }
    this.state = merged;
    for (const fn of this.listeners) fn(this.state);
  }

  setUserPrompt(prompt: string) {
    this.cancelPendingIdle();
    this.set({
      userPrompt: prompt,
      lastActivity: Date.now(),
    });
  }

  setListening(on: boolean) {
    this.cancelPendingIdle();
    if (on) {
      this.set({ mode: "listening", lastActivity: Date.now() });
    } else if (this.state.mode === "listening") {
      this.set({ mode: "idle" });
    }
  }

  setThinking() {
    this.cancelPendingIdle();
    this.set({ mode: "thinking", emotion: "thinking", lastActivity: Date.now() });
  }

  onToken(runningText: string) {
    this.cancelPendingIdle();
    const emotion = detectEmotion(runningText);
    this.set({ mode: "speaking", emotion, lastActivity: Date.now() });
  }

  onDone(graceMs = 2500) {
    this.cancelPendingIdle();
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      this.set({ mode: "idle" });
    }, graceMs);
  }

  reset() {
    this.cancelPendingIdle();
    this.set({ mode: "idle", emotion: "neutral", userPrompt: "", lastActivity: Date.now() });
  }
}

export const avatarState = new AvatarStateStore();
