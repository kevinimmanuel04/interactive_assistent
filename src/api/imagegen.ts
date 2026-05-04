import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { ImageEvent } from "./types";

export function onImage(cb: (e: ImageEvent) => void): Promise<UnlistenFn> {
  return listen<ImageEvent>("image", (evt) => cb(evt.payload));
}

export async function generateImage(
  prompt: string,
  size?: { width: number; height: number },
): Promise<string> {
  return invoke<string>("generate_image", {
    prompt,
    width: size?.width,
    height: size?.height,
  });
}

export async function cancelImageGeneration(): Promise<void> {
  await invoke("cancel_image_generation");
}

export async function saveGeneratedImage(
  pngBase64: string,
  targetPath: string,
): Promise<void> {
  await invoke("save_generated_image", { pngBase64, targetPath });
}

export async function setImagegenProvider(
  provider: "openrouter" | "replicate" | "local",
): Promise<void> {
  await invoke("set_imagegen_provider", { provider });
}

export async function setImagegenOpenrouterModel(model: string): Promise<void> {
  await invoke("set_imagegen_openrouter_model", { model });
}

export async function setImagegenReplicateModel(model: string): Promise<void> {
  await invoke("set_imagegen_replicate_model", { model });
}

export async function setImagegenLocalBinary(path: string): Promise<void> {
  await invoke("set_imagegen_local_binary", { path });
}

export async function setImagegenLocalModel(path: string): Promise<void> {
  await invoke("set_imagegen_local_model", { path });
}

export async function setImagegenDevice(
  device: "auto" | "cpu" | "cuda",
): Promise<void> {
  await invoke("set_imagegen_device", { device });
}

export async function setImagegenSize(
  width: number,
  height: number,
): Promise<void> {
  await invoke("set_imagegen_size", { width, height });
}

export async function setImagegenSteps(steps: number): Promise<void> {
  await invoke("set_imagegen_steps", { steps });
}

export async function setImagegenNegativePrompt(prompt: string): Promise<void> {
  await invoke("set_imagegen_negative_prompt", { prompt });
}

export async function setReplicateToken(key: string): Promise<void> {
  await invoke("set_replicate_token", { key });
}

export async function clearReplicateToken(): Promise<void> {
  await invoke("clear_replicate_token");
}
