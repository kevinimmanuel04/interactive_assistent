import { isTauri } from "@tauri-apps/api/core";

/**
 * Environment detection utility to determine if running inside Tauri desktop webview
 * or a standard web browser (e.g. Chrome / Edge).
 */
export const isDesktopWidget = (): boolean => {
  try {
    return isTauri();
  } catch {
    return false;
  }
};
