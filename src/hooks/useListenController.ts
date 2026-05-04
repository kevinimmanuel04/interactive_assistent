import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { avatarState } from "../avatarState";
import { ListenController } from "../listen";
import { setListenEnabled, type PublicSettings } from "../api";

/**
 * Owns the singleton continuous-listen `ListenController`: lazily creates
 * it on first mount, keeps it pointed at the latest settings via the
 * shared `settingsRef`, and toggles enable/disable in response to the
 * `listen_enabled` switch.
 *
 * Returns the live `listening` flag (true while the mic stream is active)
 * and the `heardHint` flag (briefly true while VAD is detecting speech).
 */
export function useListenController(opts: {
  settings: PublicSettings | null;
  settingsRef: MutableRefObject<PublicSettings | null>;
  refreshSettings: () => void;
  /** App-level chat-submit bridge (set in App via a ref). */
  handleSubmitRef: MutableRefObject<((text: string) => void) | null>;
  setBubbleText: (text: string | null) => void;
  setUserEcho: (text: string | null) => void;
}): { listening: boolean; heardHint: boolean } {
  const {
    settings,
    settingsRef,
    refreshSettings,
    handleSubmitRef,
    setBubbleText,
    setUserEcho,
  } = opts;
  const controllerRef = useRef<ListenController | null>(null);
  const [listening, setListening] = useState(false);
  const [heardHint, setHeardHint] = useState(false);

  // Auto-listen: when enabled, keep the continuous-listen switch on so the
  // assistant can hear the next prompt without a mic click. The existing
  // ListenController already handles VAD + re-arming between utterances.
  useEffect(() => {
    if (settings?.auto_listen && !settings?.listen_enabled) {
      setListenEnabled(true).catch(() => {});
      refreshSettings();
    }
  }, [settings?.auto_listen, settings?.listen_enabled, refreshSettings]);

  // Continuous-listen controller: lazily created, attached to live settings
  // through a ref callback so wake-word changes propagate without restart.
  useEffect(() => {
    if (!controllerRef.current) {
      controllerRef.current = new ListenController({
        getWakeWord: () => settingsRef.current?.wake_word ?? null,
        getInputDevice: () =>
          settingsRef.current?.audio_input_device ?? null,
        onSpeechStart: () => {
          setHeardHint(true);
          avatarState.setListening(true);
          setBubbleText(null);
          setUserEcho("🎙 Listening…");
        },
        onSpeechEnd: () => {
          setHeardHint(false);
          avatarState.setListening(false);
          setUserEcho("⏳ Transcribing…");
        },
        onTranscript: (text) => {
          // Route the transcript through the normal chat pipeline so the
          // rest of the UI (route badge, streaming tokens) works
          // identically to keyboard input.
          handleSubmitRef.current?.(text);
        },
        onIgnored: (_text, reason) => {
          if (reason === "wake-word") {
            // Wake-word required but absent — clear the hint silently.
            setUserEcho(null);
          } else {
            // Empty transcription — let the user know nothing was heard.
            setUserEcho(null);
          }
        },
        onError: (err) => {
          console.warn("[listen]", err);
          setUserEcho(`⚠ ${String(err)}`);
        },
      });
    }
    const wantEnabled = settings?.listen_enabled === true;
    const ctrl = controllerRef.current;
    const running = ctrl.isEnabled();
    if (wantEnabled && !running) {
      ctrl
        .enable()
        .then(() => setListening(true))
        .catch((err) => {
          console.warn("[listen] enable failed:", err);
          setListenEnabled(false).catch(() => {});
        });
    } else if (!wantEnabled && running) {
      ctrl.disable().then(() => setListening(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.listen_enabled]);

  // Tear down mic stream on unmount.
  useEffect(() => {
    return () => {
      controllerRef.current?.disable().catch(() => {});
    };
  }, []);

  return { listening, heardHint };
}
