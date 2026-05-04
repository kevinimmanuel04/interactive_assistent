import { invoke } from "@tauri-apps/api/core";
import type { FolderStats, IndexReport } from "./types";

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
