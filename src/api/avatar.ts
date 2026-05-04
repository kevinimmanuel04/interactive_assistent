import { invoke } from "@tauri-apps/api/core";

export async function setLive2dModel(url: string): Promise<void> {
  await invoke("set_live2d_model", { url });
}

export async function setAvatarZoom(value: number): Promise<void> {
  await invoke("set_avatar_zoom", { value });
}

export async function setAvatarOffset(
  offsetX: number,
  offsetY: number,
): Promise<void> {
  await invoke("set_avatar_offset", { offsetX, offsetY });
}
