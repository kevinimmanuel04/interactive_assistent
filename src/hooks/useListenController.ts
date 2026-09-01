import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { avatarState } from "../avatarState";
import type { PublicSettings } from "../api";
import { isDesktopWidget } from "../utils/env";
import { checkAndExecuteDirectIntent } from "../utils/intentHandler";
import { getActiveCharacter } from "../utils/characters";

export function useListenController(opts: {
  settings: PublicSettings | null;
  settingsRef: MutableRefObject<PublicSettings | null>;
  refreshSettings: () => void;
  /** App-level chat-submit bridge (set in App via a ref). */
  handleSubmitRef: MutableRefObject<((text: string) => void) | null>;
  setBubbleText: (text: string | null) => void;
  setUserEcho: (text: string | null) => void;
}): { listening: boolean; heardHint: boolean } {
  const { handleSubmitRef, setBubbleText, setUserEcho } = opts;
  const [listening, setListening] = useState(false);
  const [heardHint, setHeardHint] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Dynamic setting state synchronized in real-time across settings events
  const [wakeWordEnabled, setWakeWordEnabled] = useState(
    () => localStorage.getItem("april_wake_word_auto_listen") !== "false"
  );
  const wakeWordRef = useRef(wakeWordEnabled);

  useEffect(() => {
    wakeWordRef.current = wakeWordEnabled;
  }, [wakeWordEnabled]);

  // Sync setting change in real time when toggled in Settings panel
  useEffect(() => {
    const syncSettings = () => {
      const enabled = localStorage.getItem("april_wake_word_auto_listen") !== "false";
      setWakeWordEnabled(enabled);
    };
    window.addEventListener("april-settings-updated", syncSettings);
    window.addEventListener("storage", syncSettings);
    return () => {
      window.removeEventListener("april-settings-updated", syncSettings);
      window.removeEventListener("storage", syncSettings);
    };
  }, []);

  // 24/7 Simultaneous Real-Time Web Speech Recognition for Desktop Widget Mode
  useEffect(() => {
    if (!isDesktopWidget() || !wakeWordEnabled) {
      setListening(false);
      setHeardHint(false);
      avatarState.setListening(false);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      return;
    }

    const SpeechConstructor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechConstructor) {
      console.warn("[ContinuousMic] Speech recognition not supported in browser environment.");
      return;
    }

    const instance = new SpeechConstructor();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = "en-US";

    let finalAccumulated = "";

    instance.onstart = () => {
      setListening(true);
      console.log("[ContinuousMic] Active & listening continuously in Widget Mode...");
    };

    instance.onresult = (event: any) => {
      if (!wakeWordRef.current) return;

      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i];
        if (res.isFinal) {
          finalAccumulated += (finalAccumulated ? " " : "") + res[0].transcript;
        } else {
          interim += (interim ? " " : "") + res[0].transcript;
        }
      }

      const currentSpoken = (finalAccumulated + " " + interim).trim();

      if (currentSpoken) {
        setHeardHint(true);
        avatarState.setListening(true);
        setBubbleText(null);

        // Show live real-time speech typing simultaneously as the user speaks
        setUserEcho(currentSpoken);

        // Auto-submit on final sentence completion
        if (finalAccumulated.trim() && event.results[event.results.length - 1]?.isFinal) {
          const raw = finalAccumulated.trim();
          const lower = raw.toLowerCase();

          // Dynamic wake-word filter based on active character (April, Yvette, or Chang-Li)
          const activeChar = getActiveCharacter(opts.settings?.live2d_model_url);
          const wakeVariants = [
            ...activeChar.wakeWords,
            "hey april", "hi april", "okay april", "ok april", "april",
            "hey yvette", "hi yvette", "okay yvette", "ok yvette", "yvette",
            "hey chang-li", "hi chang-li", "okay chang-li", "ok chang-li", "chang-li", "chang li", "hey chang li",
          ];
          let cleanPrompt = raw;

          for (const variant of wakeVariants) {
            const idx = lower.indexOf(variant);
            if (idx !== -1) {
              const sliced = raw.slice(idx + variant.length).replace(/^[\s,.\-!?:;]+/, "").trim();
              if (sliced) cleanPrompt = sliced;
              break;
            }
          }

          console.log(`[ContinuousMic] Sending real-time transcript to ${activeChar.name}:`, cleanPrompt);

          checkAndExecuteDirectIntent(cleanPrompt, { setBubbleText }).then((handled) => {
            if (handled) {
              finalAccumulated = "";
              setHeardHint(false);
              avatarState.setListening(false);
              return;
            }
            handleSubmitRef.current?.(cleanPrompt);
            finalAccumulated = "";
            setHeardHint(false);
            avatarState.setListening(false);
          });
          return;

          finalAccumulated = "";
          setHeardHint(false);
          avatarState.setListening(false);
        }
      }
    };

    instance.onerror = (event: any) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        console.warn("[ContinuousMic] Error:", event.error);
      }
    };

    instance.onend = () => {
      setListening(false);
      setHeardHint(false);
      avatarState.setListening(false);

      // ONLY auto-restart if wake word is STILL ENABLED by the user in Settings!
      if (isDesktopWidget() && wakeWordRef.current) {
        setTimeout(() => {
          if (wakeWordRef.current) {
            try {
              instance.start();
            } catch {}
          }
        }, 300);
      }
    };

    recognitionRef.current = instance;
    try {
      instance.start();
    } catch {}

    return () => {
      try {
        instance.abort();
      } catch {}
      recognitionRef.current = null;
    };
  }, [wakeWordEnabled, handleSubmitRef, setBubbleText, setUserEcho]);

  return { listening, heardHint };
}
