import { invoke } from "@tauri-apps/api/core";

// --- OpenRouter STT -------------------------------------------------------

export async function setOpenRouterSttEnabled(enabled: boolean): Promise<void> {
  await invoke("set_openrouter_stt_enabled", { enabled });
}

export async function setOpenRouterSttModel(model: string): Promise<void> {
  await invoke("set_openrouter_stt_model", { model });
}

// --- Faster-Whisper -------------------------------------------------------

export async function setFasterWhisperEnabled(enabled: boolean): Promise<void> {
  await invoke("set_faster_whisper_enabled", { enabled });
}

export async function setFasterWhisperUrl(url: string): Promise<void> {
  await invoke("set_faster_whisper_url", { url });
}

export async function setFasterWhisperModel(model: string): Promise<void> {
  await invoke("set_faster_whisper_model", { model });
}

export async function setFasterWhisperLanguage(language: string): Promise<void> {
  await invoke("set_faster_whisper_language", { language });
}

export async function validateFasterWhisper(url: string): Promise<void> {
  await invoke("validate_faster_whisper", { url });
}

// --- Deepgram -------------------------------------------------------------

export async function setDeepgramKey(key: string): Promise<void> {
  await invoke("set_deepgram_key", { key });
}

export async function clearDeepgramKey(): Promise<void> {
  await invoke("clear_deepgram_key");
}

export async function validateDeepgramKey(key: string): Promise<void> {
  await invoke("validate_deepgram_key", { key });
}

export async function setDeepgramEnabled(enabled: boolean): Promise<void> {
  await invoke("set_deepgram_enabled", { enabled });
}

export async function setDeepgramModel(model: string): Promise<void> {
  await invoke("set_deepgram_model", { model });
}

export async function setDeepgramLanguage(language: string): Promise<void> {
  await invoke("set_deepgram_language", { language });
}

// --- Whisper / recording / listen ----------------------------------------

export async function setWhisperModel(path: string): Promise<void> {
  await invoke("set_whisper_model", { path });
}

export async function startRecording(): Promise<void> {
  await invoke("start_recording");
}

export async function stopRecording(): Promise<string> {
  return invoke<string>("stop_recording");
}

export async function cancelRecording(): Promise<void> {
  await invoke("cancel_recording");
}

export async function setWakeWord(phrase: string): Promise<void> {
  await invoke("set_wake_word", { phrase });
}

export async function setListenEnabled(enabled: boolean): Promise<void> {
  await invoke("set_listen_enabled", { enabled });
}

export async function setAutoListen(enabled: boolean): Promise<void> {
  await invoke("set_auto_listen", { enabled });
}
