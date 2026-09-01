import { useEffect, useRef, useState, useCallback } from "react";
import { isDesktopWidget } from "../utils/env";
import { getActiveCharacter } from "../utils/characters";

interface UseWakeWordOptions {
  onWakeWordDetected: (promptText: string) => void;
  enabled?: boolean;
}

export function useWakeWord({ onWakeWordDetected, enabled = true }: UseWakeWordOptions) {
  const [isListeningForWakeWord, setIsListeningForWakeWord] = useState(false);
  const [isWoken, setIsWoken] = useState(false);
  const recognitionRef = useRef<any>(null);
  const activeRef = useRef(false);

  const startListening = useCallback(() => {
    if (!enabled || !isDesktopWidget()) return;

    const SpeechConstructor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechConstructor) {
      console.warn("[WakeWord] Speech recognition not supported on this device.");
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }

    const instance = new SpeechConstructor();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = "en-US";

    const activeChar = getActiveCharacter();

    instance.onstart = () => {
      setIsListeningForWakeWord(true);
      activeRef.current = true;
      console.log(`[WakeWord] Listening for 'Hey ${activeChar.name}' in Widget mode...`);
    };

    instance.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        const rawTranscript = result[0].transcript.trim().toLowerCase();

        // Check for character-specific and companion wake word trigger phrases
        const currentChar = getActiveCharacter();
        const wakeWordMatches = [
          ...currentChar.wakeWords,
          "hey april", "hi april", "okay april", "ok april", "april",
          "hey yvette", "hi yvette", "okay yvette", "ok yvette", "yvette",
          "hey chang-li", "hi chang-li", "okay chang-li", "ok chang-li", "chang-li", "chang li", "hey chang li",
        ];

        for (const wakeWord of wakeWordMatches) {
          const idx = rawTranscript.indexOf(wakeWord);
          if (idx !== -1) {
            // Found wake word! Extract any prompt spoken immediately after
            const promptAfter = rawTranscript.slice(idx + wakeWord.length).trim();
            console.log(`[WakeWord] Triggered by '${wakeWord}'! Spoken prompt: '${promptAfter}'`);

            setIsWoken(true);
            setTimeout(() => setIsWoken(false), 3000);

            if (promptAfter && promptAfter.length > 2 && result.isFinal) {
              onWakeWordDetected(promptAfter);
            } else if (result.isFinal && !promptAfter) {
              // User just said "Hey April" — wake up confirmation
              onWakeWordDetected("");
            }
            break;
          }
        }
      }
    };

    instance.onerror = (event: any) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        console.warn("[WakeWord] Error:", event.error);
      }
    };

    instance.onend = () => {
      setIsListeningForWakeWord(false);
      activeRef.current = false;
      // Auto-restart continuous wake-word loop if still enabled
      if (enabled && isDesktopWidget()) {
        setTimeout(() => {
          try {
            instance.start();
          } catch {}
        }, 1000);
      }
    };

    recognitionRef.current = instance;
    try {
      instance.start();
    } catch (e) {
      console.warn("[WakeWord] Failed to start:", e);
    }
  }, [enabled, onWakeWordDetected]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListeningForWakeWord(false);
    activeRef.current = false;
  }, []);

  useEffect(() => {
    if (enabled && isDesktopWidget()) {
      startListening();
    } else {
      stopListening();
    }
    return () => {
      stopListening();
    };
  }, [enabled, startListening, stopListening]);

  return {
    isListeningForWakeWord,
    isWoken,
    startListening,
    stopListening,
  };
}
