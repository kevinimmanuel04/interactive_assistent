import { invoke } from "@tauri-apps/api/core";

/// Local intent classifier (paraphrase-multilingual-MiniLM-L12-v2-Q,
/// ~120 MB ONNX, downloaded on first call to `intentLoad`). Replaces
/// hardcoded keyword matchers — currently wired into the weather
/// pre-check; other skills will follow.
///
/// Usage:
///   const ready = await intentStatus();
///   if (!ready) await intentLoad();   // first call downloads the model
///   const ranks = await intentClassifyDebug("сделай скрин экрана");
///   // → [{ intent: "screenshot", score: 0.71 }, ...]
export async function intentStatus(): Promise<boolean> {
  return invoke<boolean>("intent_status");
}

export async function intentLoad(): Promise<void> {
  await invoke("intent_load");
}

export interface IntentMatch {
  intent: string;
  score: number;
}

export async function intentClassifyDebug(
  query: string,
): Promise<IntentMatch[]> {
  return invoke<IntentMatch[]>("intent_classify_debug", { query });
}
