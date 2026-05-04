import { invoke } from "@tauri-apps/api/core";
import type { AudioDevices, SystemInfo } from "./types";

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

export async function systemInfo(): Promise<SystemInfo> {
  return invoke<SystemInfo>("system_info");
}
