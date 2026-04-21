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

export async function ragReindex(path?: string): Promise<IndexReport> {
  return invoke<IndexReport>("rag_reindex", { path: path ?? null });
}

export function onChat(cb: (e: ChatEvent) => void): Promise<UnlistenFn> {
  return listen<ChatEvent>("chat", (evt) => cb(evt.payload));
}

export function onModelProgress(
  cb: (e: DownloadEvent) => void
): Promise<UnlistenFn> {
  return listen<DownloadEvent>("models:progress", (evt) => cb(evt.payload));
}
