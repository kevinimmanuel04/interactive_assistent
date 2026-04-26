import { useCallback, useEffect, useRef, useState } from "react";
import AvatarStage from "./components/AvatarStage";
import ChatBubble from "./components/ChatBubble";
import InputField from "./components/InputField";
import ModelWizard from "./components/ModelWizard";
import SettingsPanel from "./components/SettingsPanel";
import { listen } from "@tauri-apps/api/event";
import { exit as tauriExit } from "@tauri-apps/plugin-process";
import { avatarState } from "./avatarState";
import { stripMoodTags } from "./emotion";
import { lipSync } from "./lipsync";
import { ListenController } from "./listen";
import { checkForUpdatesQuietly } from "./updater";
import {
  cancelGeneration,
  ChatEvent,
  getSettings,
  onChat,
  PublicSettings,
  resetChat,
  sendMessage,
  setListenEnabled,
} from "./api";

type Route = "local" | "cloud" | "skill";

export default function App() {
  const [inputOpen, setInputOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const [userEcho, setUserEcho] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [route, setRoute] = useState<Route | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [listening, setListening] = useState(false);
  const [heardHint, setHeardHint] = useState(false);
  const activeIdRef = useRef<string | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  const controllerRef = useRef<ListenController | null>(null);
  const settingsRef = useRef<PublicSettings | null>(null);
  const handleSubmitRef = useRef<((text: string) => void) | null>(null);

  // Load settings on mount.
  const refreshSettings = useCallback(() => {
    getSettings().then(setSettings).catch(() => {});
  }, []);
  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  // Check for app updates in the background on startup.
  useEffect(() => {
    checkForUpdatesQuietly();
  }, []);

  // Global hotkey toggles input.
  useEffect(() => {
    const p = listen<string>("hotkey:toggle-input", () => {
      setInputOpen((v) => !v);
    });
    return () => {
      p.then((fn) => fn());
    };
  }, []);

  // Apply output-device preference: browsers identify outputs by deviceId
  // (MediaDevices), not cpal's device name. Resolve by matching the label.
  useEffect(() => {
    const want = settings?.audio_output_device;
    if (!want) {
      lipSync.setSinkId(null);
      return;
    }
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((devs) => {
        const match = devs.find(
          (d) => d.kind === "audiooutput" && d.label === want,
        );
        lipSync.setSinkId(match?.deviceId ?? null);
      })
      .catch(() => {});
  }, [settings?.audio_output_device]);

  // Apply TTS volume from settings to the shared lip-sync audio element.
  useEffect(() => {
    lipSync.setVolume(settings?.tts_volume ?? 1);
  }, [settings?.tts_volume]);

  // Backend-synthesized TTS audio: play via Web Audio + drive Live2D mouth.
  useEffect(() => {
    const p = listen<string>("tts:play", (evt) => {
      console.log("[tts:play] event received:", typeof evt.payload, evt.payload?.slice?.(0, 80));
      lipSync.play(evt.payload).catch((e) => {
        console.warn("[tts] playback failed:", e);
      });
    });
    return () => {
      p.then((fn) => fn());
    };
  }, []);

  // Proactive suggestions and game-coach tips both surface as transient
  // bubbles. Skip them if a real reply is currently streaming so we don't
  // stomp on the active conversation.
  useEffect(() => {
    const showTransient = (text: string) => {
      if (activeIdRef.current) return;
      setBubbleText(text);
      if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
      bubbleTimer.current = window.setTimeout(() => {
        setBubbleText(null);
        bubbleTimer.current = null;
      }, 8000);
    };
    const p1 = listen<{ hint: string }>("proactive:suggest", (evt) => {
      const hint = evt.payload?.hint?.trim();
      if (hint) showTransient(hint);
    });
    const p2 = listen<{ game: string; hint: string }>("coach:tip", (evt) => {
      const hint = evt.payload?.hint?.trim();
      if (hint) showTransient(hint);
    });
    return () => {
      p1.then((fn) => fn());
      p2.then((fn) => fn());
    };
  }, []);

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
        onSpeechStart: () => {
          setHeardHint(true);
          avatarState.setListening(true);
        },
        onSpeechEnd: () => {
          setHeardHint(false);
          avatarState.setListening(false);
        },
        onTranscript: (text) => {
          // Route the transcript through the normal chat pipeline so the
          // rest of the UI (route badge, streaming tokens) works identically
          // to keyboard input.
          handleSubmitRef.current?.(text);
        },
        onIgnored: (_text, reason) => {
          if (reason === "wake-word") {
            // Silently drop — the user didn't address Komorebi.
          }
        },
        onError: (err) => console.warn("[listen]", err),
      });
    }
    const wantEnabled = settings?.listen_enabled === true;
    const ctrl = controllerRef.current;
    const running = ctrl.isEnabled();
    if (wantEnabled && !running) {
      ctrl.enable().then(() => setListening(true)).catch((err) => {
        console.warn("[listen] enable failed:", err);
        setListenEnabled(false).catch(() => {});
      });
    } else if (!wantEnabled && running) {
      ctrl.disable().then(() => setListening(false));
    }
  }, [settings?.listen_enabled]);

  // Keep a ref of the latest settings so the listen controller (created once)
  // always reads the current wake-word.
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Tear down mic stream on unmount.
  useEffect(() => {
    return () => {
      controllerRef.current?.disable().catch(() => {});
    };
  }, []);

  const handleToggleListen = useCallback(async () => {
    const next = !(settings?.listen_enabled ?? false);
    await setListenEnabled(next);
    refreshSettings();
  }, [settings?.listen_enabled, refreshSettings]);

  // Stream chat events.
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
          setBubbleText("");
          setThinking(true);
          break;
        case "token":
          setThinking(false);
          setBubbleText((t) => {
            // Keep raw text (with mood tags) for emotion detection,
            // but display the user-visible version with tags stripped.
            const raw = (t ?? "") + e.text;
            avatarState.onToken(raw);
            return stripMoodTags(raw);
          });
          break;
        case "done":
          setThinking(false);
          avatarState.onDone();
          scheduleBubbleHide();
          activeIdRef.current = null;
          break;
        case "error":
          setThinking(false);
          avatarState.onDone(500);
          setBubbleText(`⚠ ${e.message}`);
          scheduleBubbleHide(6000);
          activeIdRef.current = null;
          break;
      }
    });
    return () => {
      p.then((fn) => fn());
    };
  }, []);

  const scheduleBubbleHide = (ms = 8000) => {
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => {
      setBubbleText(null);
      setUserEcho(null);
      setRoute(null);
    }, ms);
  };

  const handleSubmit = async (text: string) => {
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    setBubbleText("");
    setUserEcho(text);
    setThinking(true);
    setRoute(null);
    avatarState.setThinking();
    activeIdRef.current = "pending";
    try {
      const id = await sendMessage(text);
      if (activeIdRef.current === "pending") activeIdRef.current = id;
    } catch (err) {
      activeIdRef.current = null;
      setThinking(false);
      avatarState.onDone(500);
      setBubbleText(`⚠ ${String(err)}`);
      scheduleBubbleHide(6000);
    }
  };
  handleSubmitRef.current = handleSubmit;

  const handleReset = async () => {
    await cancelGeneration();
    await resetChat();
    lipSync.stop();
    avatarState.reset();
    setBubbleText(null);
    setUserEcho(null);
    setRoute(null);
    setThinking(false);
  };

  return (
    <>
      <AvatarStage modelUrl={settings?.live2d_model_url ?? null} />
      <ChatBubble text={bubbleText} route={route} thinking={thinking} userEcho={userEcho} />
      <InputField
        open={inputOpen && !settingsOpen && !wizardOpen}
        onClose={() => setInputOpen(false)}
        onSubmit={handleSubmit}
        sttEnabled={Boolean(
          settings?.stt_available && settings?.whisper_model_path
        )}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onChanged={refreshSettings}
      />
      <ModelWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSettingsChanged={refreshSettings}
        settings={settings}
      />
      <TopBar
        mode={settings?.mode ?? "auto"}
        hasKey={settings?.has_openrouter_key ?? false}
        listenEnabled={settings?.listen_enabled ?? false}
        listenReady={Boolean(
          settings?.stt_available && settings?.whisper_model_path
        )}
        listening={listening}
        heard={heardHint}
        onToggleListen={handleToggleListen}
        onToggleSettings={() => {
          setWizardOpen(false);
          setSettingsOpen((v) => !v);
        }}
        onToggleWizard={() => {
          setSettingsOpen(false);
          setWizardOpen((v) => !v);
        }}
        onReset={handleReset}
        onQuit={() => tauriExit(0)}
      />
    </>
  );
}

function TopBar(props: {
  mode: string;
  hasKey: boolean;
  listenEnabled: boolean;
  listenReady: boolean;
  listening: boolean;
  heard: boolean;
  onToggleListen: () => void;
  onToggleSettings: () => void;
  onToggleWizard: () => void;
  onReset: () => void;
  onQuit: () => void;
}) {
  const listenColor = !props.listenReady
    ? "rgba(20,20,28,0.7)"
    : props.heard
    ? "#e24a4a"
    : props.listening
    ? "#6fae5a"
    : "rgba(20,20,28,0.7)";
  return (
    <div
      className="interactive"
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        display: "flex",
        gap: 6,
        alignItems: "center",
        fontSize: 11,
        color: "#fff",
      }}
    >
      <span
        style={{
          padding: "3px 8px",
          borderRadius: 8,
          background: "rgba(20,20,28,0.7)",
          opacity: 0.85,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
        title={props.hasKey ? "OpenRouter key saved" : "No OpenRouter key"}
      >
        {props.mode}
        {!props.hasKey && props.mode !== "local" && " ⚠"}
      </span>
      <button
        onClick={props.onToggleListen}
        disabled={!props.listenReady}
        style={{ ...iconBtn, background: listenColor }}
        title={
          !props.listenReady
            ? "Set up Whisper first (wizard → Use as STT model)"
            : props.listening
            ? "Listening — click to stop"
            : "Continuous listen"
        }
      >
        👂
      </button>
      <button onClick={props.onReset} style={iconBtn} title="Reset conversation">
        ↺
      </button>
      <button onClick={props.onToggleWizard} style={iconBtn} title="Model downloads">
        ⬇
      </button>
      <button onClick={props.onToggleSettings} style={iconBtn} title="Settings">
        ⚙
      </button>
      <button
        onClick={props.onQuit}
        style={{ ...iconBtn, background: "rgba(226, 74, 74, 0.7)" }}
        title="Quit Komorebi"
      >
        ✕
      </button>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(20,20,28,0.7)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
