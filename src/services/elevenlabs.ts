/**
 * ElevenLabs REST Voice Synthesis Service
 * Configured with active key and verified premade ElevenLabs voice IDs.
 */

import { synthesizeEdgeTTS } from "./edgeTTS";
import { toast } from "../components/Toast";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

const STORAGE_KEY = "april_elevenlabs_key";
const STORAGE_VOICE_ID = "april_elevenlabs_voice_id";

const envKey = (import.meta as any).env?.VITE_ELEVENLABS_API_KEY;
const envVoiceId = (import.meta as any).env?.VITE_ELEVENLABS_VOICE_ID;

// Permanently saved user ElevenLabs Key
export const DEFAULT_API_KEY = envKey || "";
// Verified Premade ElevenLabs Voices (Return HTTP 200 Audio on free/starter tiers)
// Default Premade ElevenLabs Voice: Jessica (Playful Female)
export const DEFAULT_PRIMARY_VOICE_ID = envVoiceId || "cgSgspJ2msm6clMCkdW9"; 
export const FALLBACK_ELEVEN_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah - Secondary Fallback

let hasWarnedQuota = false;

export function getElevenLabsKey(): string {
  const stored = localStorage.getItem(STORAGE_KEY)?.trim();
  if (stored && stored.length > 10) {
    return stored;
  }
  return DEFAULT_API_KEY;
}

export function setElevenLabsKey(key: string): void {
  const clean = key.trim();
  localStorage.setItem(STORAGE_KEY, clean);
  hasWarnedQuota = false;

  invoke("set_elevenlabs_key", { key: clean }).catch(() => {});
  emit("elevenlabs_settings_updated", { key: clean }).catch(() => {});
  window.dispatchEvent(new Event("april-settings-updated"));
}

export function getElevenLabsVoiceId(): string {
  const stored = localStorage.getItem(STORAGE_VOICE_ID)?.trim();
  if (stored && stored.length > 3) {
    return stored;
  }
  return DEFAULT_PRIMARY_VOICE_ID;
}

export function setElevenLabsVoiceId(voiceId: string): void {
  const clean = voiceId.trim();
  localStorage.setItem(STORAGE_VOICE_ID, clean);

  invoke("set_elevenlabs_voice_id", { voiceId: clean }).catch(() => {});
  emit("elevenlabs_settings_updated", { voiceId: clean }).catch(() => {});
  window.dispatchEvent(new Event("april-settings-updated"));
}

export function getAutoWakeWordEnabled(): boolean {
  return localStorage.getItem("april_wake_word_auto_listen") !== "false";
}

export function setAutoWakeWordEnabled(enabled: boolean): void {
  localStorage.setItem("april_wake_word_auto_listen", enabled ? "true" : "false");
  emit("elevenlabs_settings_updated", { autoWakeWord: enabled }).catch(() => {});
  window.dispatchEvent(new Event("april-settings-updated"));
}

export async function synthesizeElevenLabs(
  text: string,
  voiceId?: string,
  apiKey?: string
): Promise<ArrayBuffer> {
  const cleanText = text
    .replace(/<mood:[^>]+>/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();

  if (!cleanText) {
    throw new Error("Empty text provided for ElevenLabs synthesis");
  }

  const activeKey = (apiKey || getElevenLabsKey()).trim();
  const activeVoiceId = (voiceId || getElevenLabsVoiceId()).trim();

  console.log(`[ElevenLabs] Synthesizing voice with Key=${activeKey.slice(0, 12)}... VoiceID=${activeVoiceId}`);

  // Models to try for the requested voice ID: eleven_turbo_v2_5, eleven_multilingual_v2, eleven_monolingual_v1
  const modelsToTry = ["eleven_turbo_v2_5", "eleven_multilingual_v2", "eleven_monolingual_v1"];

  // 1) Try user selected Voice ID across models
  for (const modelId of modelsToTry) {
    try {
      const res = await callElevenLabs(cleanText, activeVoiceId, activeKey, modelId);
      if (res) return res;
    } catch (err: any) {
      console.warn(`[ElevenLabs] Voice ${activeVoiceId} with model ${modelId} failed:`, err);
    }
  }

  // 2) If custom voice failed, try Jessica default (DEFAULT_PRIMARY_VOICE_ID)
  if (activeVoiceId !== DEFAULT_PRIMARY_VOICE_ID) {
    for (const modelId of modelsToTry) {
      try {
        const res = await callElevenLabs(cleanText, DEFAULT_PRIMARY_VOICE_ID, activeKey, modelId);
        if (res) return res;
      } catch (err) {
        console.warn(`[ElevenLabs] Default voice ${DEFAULT_PRIMARY_VOICE_ID} failed:`, err);
      }
    }
  }

  // 3) Quota warning toast if quota is exhausted
  if (!hasWarnedQuota) {
    hasWarnedQuota = true;
    toast.error("ElevenLabs API quota reached. Please check your credit balance at elevenlabs.io!");
  }

  // 4) High-Quality Edge TTS Ava West Coast Neural Fallback
  return await synthesizeEdgeTTS(cleanText, { voice: "en-US-AvaNeural" });
}

async function callElevenLabs(
  text: string,
  voiceId: string,
  apiKey: string,
  modelId: string = "eleven_turbo_v2_5"
): Promise<ArrayBuffer | null> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (response.ok) {
    console.log(`[ElevenLabs] Successfully generated audio! (HTTP 200 OK)`);
    return await response.arrayBuffer();
  }

  const errorText = await response.text();
  console.warn(`[ElevenLabs] API returned ${response.status}: ${errorText}`);
  return null;
}
