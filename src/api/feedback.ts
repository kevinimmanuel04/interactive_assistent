import { invoke } from "@tauri-apps/api/core";
import type { FeedbackStats } from "./types";

// ============================================================================
//  Phase 1: feedback telemetry
// ============================================================================

export async function feedbackRecord(args: {
  modelLabel: string;
  route: string;
  prompt: string;
  response: string;
  rating: 1 | -1;
  lang: string;
}): Promise<number> {
  return invoke<number>("feedback_record", {
    modelLabel: args.modelLabel,
    route: args.route,
    prompt: args.prompt,
    response: args.response,
    rating: args.rating,
    lang: args.lang,
  });
}

export async function feedbackStats(): Promise<FeedbackStats> {
  return invoke<FeedbackStats>("feedback_stats");
}

export async function feedbackPurge(): Promise<number> {
  return invoke<number>("feedback_purge");
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  await invoke("set_telemetry_enabled", { enabled });
}

export async function setTelemetryEndpoint(url: string): Promise<void> {
  await invoke("set_telemetry_endpoint", { url });
}

// ============================================================================
//  Phase 2 stub: local LoRA training settings
// ============================================================================

export async function setTrainingEnabled(enabled: boolean): Promise<void> {
  await invoke("set_training_enabled", { enabled });
}

export async function setTrainingMaxCpuPct(pct: number): Promise<void> {
  await invoke("set_training_max_cpu_pct", { pct });
}

export async function setTrainingBatteryFloorPct(pct: number): Promise<void> {
  await invoke("set_training_battery_floor_pct", { pct });
}

export async function setTrainingMinExamples(n: number): Promise<void> {
  await invoke("set_training_min_examples", { n });
}

export async function setTrainingSchedule(schedule: string): Promise<void> {
  await invoke("set_training_schedule", { schedule });
}
