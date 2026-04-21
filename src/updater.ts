import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Silently checks for a new release on startup. If one is available it is
 * downloaded and installed in the background, then the app is relaunched.
 *
 * Any errors are logged to the console and otherwise ignored — the updater
 * config may be absent in dev builds (no pubkey) and that shouldn't break
 * the app.
 */
export async function checkForUpdatesQuietly(): Promise<void> {
  try {
    const update = await check();
    if (!update) return;
    // eslint-disable-next-line no-console
    console.log(`[updater] ${update.version} available — downloading`);
    await update.downloadAndInstall();
    // eslint-disable-next-line no-console
    console.log("[updater] installed — relaunching");
    await relaunch();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[updater] check skipped:", e);
  }
}
