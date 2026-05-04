import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { lipSync } from "../lipsync";

/**
 * Wires the shared `lipSync` audio element to the user's audio settings:
 *   * Resolves the cpal-named output device to a browser deviceId via
 *     `MediaDevices.enumerateDevices()` and pins the audio element to it.
 *   * Mirrors the user's TTS volume slider.
 *   * Subscribes to the `tts:play` event from the backend and plays each
 *     emitted audio chunk through `lipSync` (which also drives Live2D
 *     mouth params via the shared AnalyserNode).
 */
export function useTtsAudio(opts: {
  outputDevice: string | null | undefined;
  volume: number | undefined;
}): void {
  const { outputDevice, volume } = opts;

  // Apply output-device preference: browsers identify outputs by deviceId
  // (MediaDevices), not cpal's device name. Resolve by matching the label.
  useEffect(() => {
    if (!outputDevice) {
      lipSync.setSinkId(null);
      return;
    }
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((devs) => {
        const match = devs.find(
          (d) => d.kind === "audiooutput" && d.label === outputDevice,
        );
        lipSync.setSinkId(match?.deviceId ?? null);
      })
      .catch(() => {});
  }, [outputDevice]);

  // Apply TTS volume from settings to the shared lip-sync audio element.
  useEffect(() => {
    lipSync.setVolume(volume ?? 1);
  }, [volume]);

  // Backend-synthesized TTS audio: play via Web Audio + drive Live2D mouth.
  useEffect(() => {
    const p = listen<string>("tts:play", (evt) => {
      console.log(
        "[tts:play] event received:",
        typeof evt.payload,
        evt.payload?.slice?.(0, 80),
      );
      lipSync.play(evt.payload).catch((e) => {
        console.warn("[tts] playback failed:", e);
      });
    });
    return () => {
      p.then((fn) => fn());
    };
  }, []);
}
