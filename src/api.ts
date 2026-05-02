import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export type ChatEvent =
  | { kind: "started"; id: string; route: "local" | "cloud" | "skill" }
  | { kind: "token"; id: string; text: string }
  | { kind: "done"; id: string; full_text: string }
  | { kind: "error"; id: string; message: string };

export type Mode = "auto" | "local" | "cloud";

export interface PublicSettings {
  has_openrouter_key: boolean;
  openrouter_model: string;
  mode: string;
  local_model_path: string | null;
  tts_enabled: boolean;
  piper_binary_path: string | null;
  piper_voice_path: string | null;
  live2d_model_url: string | null;
  whisper_model_path: string | null;
  stt_available: boolean;
  wake_word: string | null;
  listen_enabled: boolean;
  smart_routing: boolean;
  classifier_model: string;
  rag_enabled: boolean;
  audio_input_device: string | null;
  audio_output_device: string | null;
  llm_gpu_layers: number | null;
  auto_listen: boolean;
  tts_provider: string;
  tts_length_scale: number | null;
  tts_noise_scale: number | null;
  tts_noise_w: number | null;
  tts_volume: number;
  sovits_endpoint: string | null;
  sovits_ref_audio: string | null;
  sovits_prompt_text: string | null;
  sovits_prompt_lang: string;
  sovits_text_lang: string;
  sovits_speed: number;
  openrouter_tts_enabled?: boolean;
  openrouter_tts_model?: string;
  openrouter_tts_voice?: string;
  openrouter_stt_enabled?: boolean;
  openrouter_stt_model?: string;
  game_coach_enabled?: boolean;
  game_coach_model?: string;
  auto_screen_watch_enabled?: boolean;
  chat_tool_calls_enabled?: boolean;
  faster_whisper_enabled?: boolean;
  faster_whisper_url?: string;
  faster_whisper_model?: string;
  faster_whisper_language?: string | null;
  has_deepgram_key?: boolean;
  deepgram_enabled?: boolean;
  deepgram_model?: string;
  deepgram_language?: string | null;
  avatar_zoom?: number;
  avatar_offset_x?: number;
  avatar_offset_y?: number;
}

export interface FolderStats {
  path: string;
  doc_count: number;
  chunk_count: number;
  indexed_at: number | null;
}

export interface IndexReport {
  files_scanned: number;
  files_indexed: number;
  files_skipped: number;
  chunks_written: number;
}

export type AssetKind =
  | "llm_gguf"
  | "piper_voice"
  | "piper_config"
  | "whisper_ggml";

export interface Asset {
  id: string;
  kind: AssetKind;
  title: string;
  description: string;
  file_name: string;
  approx_size_mb: number;
  installed: boolean;
  path: string | null;
}

export type DownloadEvent =
  | {
      kind: "started";
      file_name: string;
      total: number | null;
      resumed_from: number;
    }
  | {
      kind: "progress";
      file_name: string;
      downloaded: number;
      total: number | null;
    }
  | { kind: "verifying"; file_name: string }
  | { kind: "finished"; file_name: string; path: string }
  | { kind: "failed"; file_name: string; message: string };

export async function getSettings(): Promise<PublicSettings> {
  return invoke<PublicSettings>("get_settings");
}

export async function setOpenRouterKey(key: string): Promise<void> {
  await invoke("set_openrouter_key", { key });
}

export async function setMode(mode: Mode): Promise<void> {
  await invoke("set_mode", { mode });
}

export async function sendMessage(prompt: string): Promise<string> {
  return invoke<string>("send_message", { prompt });
}

export async function cancelGeneration(): Promise<void> {
  await invoke("cancel_generation");
}

export async function resetChat(): Promise<void> {
  await invoke("reset_chat");
}

export async function listAssets(): Promise<Asset[]> {
  return invoke<Asset[]>("list_assets");
}

export async function downloadAsset(assetId: string): Promise<void> {
  await invoke("download_asset", { assetId });
}

export async function deleteAsset(assetId: string): Promise<void> {
  await invoke("delete_asset", { assetId });
}

export async function setLocalModel(assetId: string): Promise<void> {
  await invoke("set_local_model", { assetId });
}

export async function setPiperBinary(path: string): Promise<void> {
  await invoke("set_piper_binary", { path });
}

export async function setPiperVoice(path: string): Promise<void> {
  await invoke("set_piper_voice", { path });
}

export async function setTtsEnabled(enabled: boolean): Promise<void> {
  await invoke("set_tts_enabled", { enabled });
}

export async function setLive2dModel(url: string): Promise<void> {
  await invoke("set_live2d_model", { url });
}

export async function speakText(text: string): Promise<void> {
  await invoke("speak_text", { text });
}

export async function setTtsProvider(provider: "piper" | "sovits" | "openrouter"): Promise<void> {
  await invoke("set_tts_provider", { provider });
}

export async function setOpenRouterTtsEnabled(enabled: boolean): Promise<void> {
  await invoke("set_openrouter_tts_enabled", { enabled });
}

export async function setOpenRouterTtsModel(model: string): Promise<void> {
  await invoke("set_openrouter_tts_model", { model });
}

export async function setOpenRouterTtsVoice(voice: string): Promise<void> {
  await invoke("set_openrouter_tts_voice", { voice });
}

export async function setOpenRouterSttEnabled(enabled: boolean): Promise<void> {
  await invoke("set_openrouter_stt_enabled", { enabled });
}

export async function setOpenRouterSttModel(model: string): Promise<void> {
  await invoke("set_openrouter_stt_model", { model });
}

export async function setGameCoachEnabled(enabled: boolean): Promise<void> {
  await invoke("set_game_coach_enabled", { enabled });
}

export async function setGameCoachModel(model: string): Promise<void> {
  await invoke("set_game_coach_model", { model });
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

export async function setAvatarZoom(value: number): Promise<void> {
  await invoke("set_avatar_zoom", { value });
}
export async function setAvatarOffset(offsetX: number, offsetY: number): Promise<void> {
  await invoke("set_avatar_offset", { offsetX, offsetY });
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

export interface SoVitsConfigInput {
  endpoint: string;
  refAudio: string;
  promptText: string;
  promptLang: string;
  textLang: string;
  speed: number;
}

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

export async function setSmartRouting(enabled: boolean): Promise<void> {
  await invoke("set_smart_routing", { enabled });
}

export async function setClassifierModel(model: string): Promise<void> {
  await invoke("set_classifier_model", { model });
}

export async function setRagEnabled(enabled: boolean): Promise<void> {
  await invoke("set_rag_enabled", { enabled });
}

export async function ragListFolders(): Promise<FolderStats[]> {
  return invoke<FolderStats[]>("rag_list_folders");
}

export async function ragAddFolder(path: string): Promise<void> {
  await invoke("rag_add_folder", { path });
}

export async function ragRemoveFolder(path: string): Promise<void> {
  await invoke("rag_remove_folder", { path });
}

export interface AudioDevices {
  inputs: string[];
  outputs: string[];
  default_input: string | null;
  default_output: string | null;
}

export async function listAudioDevices(): Promise<AudioDevices> {
  return invoke<AudioDevices>("list_audio_devices");
}

export async function setAudioInput(name: string): Promise<void> {
  await invoke("set_audio_input", { name });
}

export async function setAudioOutput(name: string): Promise<void> {
  await invoke("set_audio_output", { name });
}

export async function setLlmGpuLayers(layers: number | null): Promise<void> {
  await invoke("set_llm_gpu_layers", { layers });
}

export async function setAutoListen(enabled: boolean): Promise<void> {
  await invoke("set_auto_listen", { enabled });
}

export interface SystemInfo {
  os: string;
  cpu: string;
  cpu_cores: number;
  ram_gb: number;
  gpus: string[];
  has_nvidia: boolean;
  hostname: string;
}

export async function systemInfo(): Promise<SystemInfo> {
  return invoke<SystemInfo>("system_info");
}

export interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
}

export async function listOpenRouterModels(): Promise<OpenRouterModel[]> {
  return invoke<OpenRouterModel[]>("list_openrouter_models");
}

export async function setOpenRouterModel(model: string): Promise<void> {
  await invoke("set_openrouter_model", { model });
}

export async function ragReindex(path?: string): Promise<IndexReport> {
  return invoke<IndexReport>("rag_reindex", { path: path ?? null });
}

// --- Vision (screen / region / attached image) ---------------------------

export async function visionCaptureFull(prompt: string): Promise<string> {
  return invoke<string>("vision_capture_full", { prompt });
}

export interface VisionRegion {
  monitor?: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function visionCaptureRegion(
  prompt: string,
  region: VisionRegion,
): Promise<string> {
  return invoke<string>("vision_capture_region", {
    args: {
      prompt,
      monitor: region.monitor ?? 0,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
    },
  });
}

export async function visionWithImage(
  prompt: string,
  pngBase64: string,
): Promise<string> {
  return invoke<string>("vision_with_image", { prompt, pngBase64 });
}

/// Capture the primary monitor and return raw PNG bytes — used by the
/// region picker overlay to show the user a still of the screen they can
/// drag a rectangle on.
export async function desktopScreenshot(monitor = 0): Promise<Uint8Array> {
  const out = await invoke<ArrayBuffer | Uint8Array | number[]>(
    "desktop_screenshot",
    { monitor },
  );
  if (out instanceof Uint8Array) return out;
  if (out instanceof ArrayBuffer) return new Uint8Array(out);
  return new Uint8Array(out as number[]);
}

export interface ScreenInfo {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  is_primary: boolean;
  scale_factor: number;
}

export async function desktopListScreens(): Promise<ScreenInfo[]> {
  return invoke<ScreenInfo[]>("desktop_list_screens");
}

export function onChat(cb: (e: ChatEvent) => void): Promise<UnlistenFn> {
  return listen<ChatEvent>("chat", (evt) => cb(evt.payload));
}

export function onModelProgress(
  cb: (e: DownloadEvent) => void
): Promise<UnlistenFn> {
  return listen<DownloadEvent>("models:progress", (evt) => cb(evt.payload));
}
