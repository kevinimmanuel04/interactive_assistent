import { useEffect, type MutableRefObject } from "react";
import { avatarState } from "../avatarState";
import { stripMoodTags } from "../emotion";
import { onChat, type ChatEvent, type PublicSettings } from "../api";
import { saveMessage } from "../services/chatStorage";
import { synthesizeElevenLabs } from "../services/elevenlabs";
import { lipSync } from "../lipsync";

export type Route = "local" | "cloud" | "skill";

export interface LastTurn {
  id: string | number;
  prompt: string;
  response: string;
  route: Route;
  modelLabel: string;
}

function fallbackWebSpeech(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const clean = text.replace(/<mood:[^>]+>/g, "").replace(/<[^>]+>/g, "").trim();
    if (!clean) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.pitch = 1.1;
    utterance.rate = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(
      (v) =>
        v.name.includes("Jenny") ||
        v.name.includes("Zira") ||
        v.name.includes("Female") ||
        v.name.includes("Samantha") ||
        v.lang.startsWith("en")
    );
    if (femaleVoice) utterance.voice = femaleVoice;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn("[tts] Web Speech API failed:", e);
  }
}

/**
 * Bridges the backend `chat:*` event stream onto the visible bubble +
 * route badge + emotion engine, and freezes each completed turn into
 * `lastTurnRef` for the feedback widget.
 *
 * `activeIdRef` is the source of truth for "which chat turn is currently
 * streaming" — it's a sentinel `"pending"` between submit and the
 * backend's first event, then the real id once `started` fires.
 */
export function useChatStream(opts: {
  activeIdRef: MutableRefObject<string | null>;
  lastTurnRef: MutableRefObject<LastTurn | null>;
  settingsRef: MutableRefObject<PublicSettings | null>;
  rawTextRef: MutableRefObject<string>;
  setRoute: (r: Route | null) => void;
  setModelLabel?: (label: string | null) => void;
  setBubbleText: (text: string | null) => void;
  setThinking: (v: boolean) => void;
  setFeedbackKey: (updater: (k: number) => number) => void;
  scheduleBubbleHide: (ms?: number) => void;
  onGenerateImage?: (prompt: string) => void;
}): void {
  const {
    activeIdRef,
    lastTurnRef,
    settingsRef,
    rawTextRef,
    setRoute,
    setModelLabel,
    setBubbleText,
    setThinking,
    setFeedbackKey,
    scheduleBubbleHide,
    onGenerateImage,
  } = opts;

  useEffect(() => {
    const p = onChat((e: ChatEvent) => {
      // Race-free id matching: the backend starts emitting events on a
      // spawned task before `sendMessage` returns the id. Reserve the slot
      // with the sentinel "pending" on submit; the first event adopts its
      // real id.
      if (activeIdRef.current === "pending") activeIdRef.current = e.id;
      if (e.id !== activeIdRef.current) return;
      switch (e.kind) {
        case "started":
          setRoute(e.route);
          if (e.model_label && setModelLabel) {
            setModelLabel(e.model_label);
          }
          setBubbleText("");
          rawTextRef.current = "";
          setThinking(true);
          // Open a fresh feedback turn. Prompt was stashed in `lastTurnRef`
          // by handleSubmit; record route + model_label here when known.
          if (lastTurnRef.current) {
            const s = settingsRef.current;
            const modelLabel =
              e.route === "cloud"
                ? `openrouter:${s?.openrouter_model ?? "?"}`
                : e.route === "local"
                  ? `local:${(s?.local_model_path ?? "").split(/[\\/]/).pop() || "?"}`
                  : `skill:${e.route}`;
            lastTurnRef.current = {
              ...lastTurnRef.current,
              id: e.id,
              route: e.route,
              modelLabel,
              response: "",
            };
          }
          break;
        case "token":
          setThinking(false);
          rawTextRef.current += e.text;
          avatarState.onToken(rawTextRef.current);
          setBubbleText(stripMoodTags(rawTextRef.current));
          break;
        case "done":
          setThinking(false);
          avatarState.onDone();
          let rawFull = rawTextRef.current;
          const imgMatch = rawFull.match(/\[GENERATE_IMAGE:\s*(.*?)\]/i);
          if (imgMatch && imgMatch[1]) {
            const imagePrompt = imgMatch[1].trim();
            rawFull = rawFull.replace(/\[GENERATE_IMAGE:\s*(.*?)\]/i, "").trim();
            if (onGenerateImage) {
              onGenerateImage(imagePrompt);
            }
          }
          const cleanResp = stripMoodTags(rawFull);
          // Freeze the response text for feedback before scheduling hide.
          if (lastTurnRef.current && lastTurnRef.current.id === e.id) {
            lastTurnRef.current.response = cleanResp;
            setFeedbackKey((k) => k + 1);
          }
          // Save assistant message into persistent chat memory
          if (cleanResp) {
            saveMessage("assistant", cleanResp);

            // Guaranteed Speech Synthesis: ElevenLabs -> EdgeTTS -> Web Speech API fallback
            synthesizeElevenLabs(cleanResp)
              .then(async (audioBytes) => {
                try {
                  await lipSync.playBytes(audioBytes, "audio/mp3");
                } catch (playErr) {
                  try {
                    const blob = new Blob([audioBytes], { type: "audio/mp3" });
                    const audio = new Audio(URL.createObjectURL(blob));
                    await audio.play();
                  } catch (audioErr) {
                    console.warn("[tts] Direct audio playback failed, falling back to Web Speech:", audioErr);
                    fallbackWebSpeech(cleanResp);
                  }
                }
                // Schedule subtitle hide 12 seconds AFTER speech audio finishes!
                scheduleBubbleHide(12000);
              })
              .catch((err) => {
                console.warn("[elevenlabs] Synthesis failed, falling back to Web Speech API:", err);
                fallbackWebSpeech(cleanResp);
                scheduleBubbleHide(14000);
              });
          } else {
            scheduleBubbleHide(10000);
          }
          activeIdRef.current = null;
          rawTextRef.current = "";
          break;
        case "error":
          setThinking(false);
          avatarState.onDone(500);
          setBubbleText(`⚠ ${e.message}`);
          scheduleBubbleHide(6000);
          activeIdRef.current = null;
          rawTextRef.current = "";
          // Cancel the pending feedback turn — no usable reply.
          lastTurnRef.current = null;
          break;
      }
    });
    return () => {
      p.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
