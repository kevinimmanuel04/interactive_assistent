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
  // Never run the auto-updater in dev mode: dev builds carry a fixed compiled
  // version which can be older than the latest published release, causing the
  // updater to reinstall the production binary on every launch (infinite
  // reinstall loop). In dev, Vite serves the frontend over http(s); production
  // Tauri bundles use the `tauri:` / `http://tauri.localhost` custom protocols.
  const proto = window.location.protocol;
  if (proto === "http:" || proto === "https:") {
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      return;
    }
  }
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
