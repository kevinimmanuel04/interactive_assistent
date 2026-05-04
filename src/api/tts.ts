import { invoke } from "@tauri-apps/api/core";
import type { SoVitsConfigInput } from "./types";

// --- Piper / general ------------------------------------------------------

export async function setPiperBinary(path: string): Promise<void> {
  await invoke("set_piper_binary", { path });
}

export async function setPiperVoice(path: string): Promise<void> {
  await invoke("set_piper_voice", { path });
}

export async function setTtsEnabled(enabled: boolean): Promise<void> {
  await invoke("set_tts_enabled", { enabled });
}

export async function speakText(text: string): Promise<void> {
  await invoke("speak_text", { text });
}

export async function setTtsProvider(
  provider: "piper" | "sovits" | "openrouter",
): Promise<void> {
  await invoke("set_tts_provider", { provider });
}

export async function setTtsProsody(
  lengthScale: number | null,
  noiseScale: number | null,
  noiseW: number | null,
): Promise<void> {
  await invoke("set_tts_prosody", {
    lengthScale,
    noiseScale,
    noiseW,
  });
}

export async function setTtsVolume(volume: number): Promise<void> {
  await invoke("set_tts_volume", { volume });
}

// --- OpenRouter TTS -------------------------------------------------------

export async function setOpenRouterTtsEnabled(enabled: boolean): Promise<void> {
  await invoke("set_openrouter_tts_enabled", { enabled });
}

export async function setOpenRouterTtsModel(model: string): Promise<void> {
  await invoke("set_openrouter_tts_model", { model });
}

export async function setOpenRouterTtsVoice(voice: string): Promise<void> {
  await invoke("set_openrouter_tts_voice", { voice });
}

// --- GPT-SoVITS -----------------------------------------------------------

export async function setSovitsConfig(c: SoVitsConfigInput): Promise<void> {
  await invoke("set_sovits_config", {
    endpoint: c.endpoint,
    refAudio: c.refAudio,
    promptText: c.promptText,
    promptLang: c.promptLang,
    textLang: c.textLang,
    speed: c.speed,
  });
}
