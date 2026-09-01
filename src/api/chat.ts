import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type {
  ChatEvent,
  Mode,
  OpenRouterModel,
  PublicSettings,
} from "./types";
import { isDesktopWidget } from "../utils/env";
import { streamWebChatCompletion } from "../services/webChat";

export async function getSettings(): Promise<PublicSettings> {
  if (!isDesktopWidget()) {
    const hasKey = !!(
      localStorage.getItem("openrouter_api_key") ||
      localStorage.getItem("april_openrouter_key") ||
      localStorage.getItem("april_api_key")
    );
    return {
      has_openrouter_key: hasKey,
      openrouter_model:
        localStorage.getItem("april_openrouter_model") ||
        "mimo-v2.5-free",
      mode: "cloud",
      local_model_path: null,
      tts_enabled: true,
      piper_binary_path: null,
      piper_voice_path: null,
      live2d_model_url: "/april.vrm",
      whisper_model_path: null,
      stt_available: true,
      wake_word: null,
      listen_enabled: false,
      smart_routing: true,
      classifier_model: "default",
      rag_enabled: false,
      audio_input_device: null,
      audio_output_device: null,
      llm_gpu_layers: null,
      auto_listen: false,
      tts_provider: "elevenlabs",
      tts_length_scale: null,
      tts_noise_scale: null,
      tts_noise_w: null,
      tts_volume: 1.0,
      sovits_endpoint: null,
      sovits_ref_audio: null,
      sovits_prompt_text: null,
      sovits_prompt_lang: "en",
      sovits_text_lang: "en",
      sovits_speed: 1.0,
    } as PublicSettings;
  }
  return invoke<PublicSettings>("get_settings");
}

export async function setOpenRouterKey(key: string): Promise<void> {
  const clean = key.trim();
  localStorage.setItem("openrouter_api_key", clean);
  localStorage.setItem("april_openrouter_key", clean);
  localStorage.setItem("april_api_key", clean);
  localStorage.setItem("april_openrouter_key", clean);

  if (isDesktopWidget()) {
    await invoke("set_openrouter_key", { key: clean });
  }
}

export async function setMode(mode: Mode): Promise<void> {
  if (isDesktopWidget()) {
    await invoke("set_mode", { mode });
  }
}

export async function sendMessage(prompt: string): Promise<string> {
  if (!isDesktopWidget()) {
    return streamWebChatCompletion([{ role: "user", content: prompt }], () => {});
  }
  return invoke<string>("send_message", { prompt });
}

export async function cancelGeneration(): Promise<void> {
  if (isDesktopWidget()) {
    await invoke("cancel_generation");
  }
}

export async function resetChat(): Promise<void> {
  if (isDesktopWidget()) {
    await invoke("reset_chat");
  }
}

export async function setSmartRouting(enabled: boolean): Promise<void> {
  if (isDesktopWidget()) {
    await invoke("set_smart_routing", { enabled });
  }
}

export async function setClassifierModel(model: string): Promise<void> {
  if (isDesktopWidget()) {
    await invoke("set_classifier_model", { model });
  }
}

export async function listOpenRouterModels(): Promise<OpenRouterModel[]> {
  if (!isDesktopWidget()) {
    return [];
  }
  return invoke<OpenRouterModel[]>("list_openrouter_models");
}

export async function setOpenRouterModel(model: string): Promise<void> {
  localStorage.setItem("april_openrouter_model", model);
  if (isDesktopWidget()) {
    await invoke("set_openrouter_model", { model });
  }
}

export function onChat(cb: (e: ChatEvent) => void): Promise<UnlistenFn> {
  if (!isDesktopWidget()) {
    return Promise.resolve(() => {});
  }
  return listen<ChatEvent>("chat", (evt) => cb(evt.payload));
}
