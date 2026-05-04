import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { Asset, DownloadEvent } from "./types";

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

/**
 * Optional dedicated model for skill-routing classification (separate
 * from the main chat model). Pass an asset id from the local model
 * registry. Use {@link clearLocalClassifierModel} to revert to "use
 * the chat model".
 */
export async function setLocalClassifierModel(assetId: string): Promise<void> {
  await invoke("set_local_classifier_model", { assetId });
}

export async function clearLocalClassifierModel(): Promise<void> {
  await invoke("clear_local_classifier_model");
}

export function onModelProgress(
  cb: (e: DownloadEvent) => void,
): Promise<UnlistenFn> {
  return listen<DownloadEvent>("models:progress", (evt) => cb(evt.payload));
}
