import { invoke } from "@tauri-apps/api/core";
import type { ScreenInfo, VisionRegion } from "./types";

// --- Vision (screen / region / attached image) ---------------------------

export async function visionCaptureFull(prompt: string): Promise<string> {
  return invoke<string>("vision_capture_full", { prompt });
}

export async function visionCaptureRegion(
  prompt: string,
  region: VisionRegion,
): Promise<string> {
  return invoke<string>("vision_capture_region", {
    args: {
      prompt,
      monitor: region.monitor ?? 0,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
    },
  });
}

export async function visionWithImage(
  prompt: string,
  pngBase64: string,
): Promise<string> {
  return invoke<string>("vision_with_image", { prompt, pngBase64 });
}

export async function enterRegionPickerMode(prompt: string): Promise<void> {
  await invoke("enter_region_picker_mode", { prompt });
}

export async function exitRegionPickerMode(): Promise<void> {
  await invoke("exit_region_picker_mode");
}

/// Capture the primary monitor and return raw PNG bytes — used by the
/// region picker overlay to show the user a still of the screen they can
/// drag a rectangle on.
export async function desktopScreenshot(monitor = 0): Promise<Uint8Array> {
  const out = await invoke<ArrayBuffer | Uint8Array | number[]>(
    "desktop_screenshot",
    { monitor },
  );
  if (out instanceof Uint8Array) return out;
  if (out instanceof ArrayBuffer) return new Uint8Array(out);
  return new Uint8Array(out as number[]);
}

export async function desktopListScreens(): Promise<ScreenInfo[]> {
  return invoke<ScreenInfo[]>("desktop_list_screens");
}

// --- Game coach -----------------------------------------------------------

export async function setGameCoachEnabled(enabled: boolean): Promise<void> {
  await invoke("set_game_coach_enabled", { enabled });
}

export async function setGameCoachModel(model: string): Promise<void> {
  await invoke("set_game_coach_model", { model });
}

/**
 * When `false`, the coach uses a text-only path (no screenshot) that
 * can run on the local LLM. See proposal 0002 for design.
 */
export async function setGameCoachUseVision(enabled: boolean): Promise<void> {
  await invoke("set_game_coach_use_vision", { enabled });
}
