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
}

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

export function onChat(cb: (e: ChatEvent) => void): Promise<UnlistenFn> {
  return listen<ChatEvent>("chat", (evt) => cb(evt.payload));
}
