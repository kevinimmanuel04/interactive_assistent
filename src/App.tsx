import { useCallback, useEffect, useRef, useState } from "react";
import AvatarStage from "./components/AvatarStage";
import ChatBubble from "./components/ChatBubble";
import InputField from "./components/InputField";
import ModelWizard from "./components/ModelWizard";
import SettingsPanel from "./components/SettingsPanel";
import { listen } from "@tauri-apps/api/event";
import { avatarState } from "./avatarState";
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
  const [inputOpen, setInputOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [bubbleText, setBubbleText] = useState<string | null>(null);
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

  // Backend-synthesized TTS audio: play via Web Audio + drive Live2D mouth.
  useEffect(() => {
    const p = listen<string>("tts:play", (evt) => {
      lipSync.play(evt.payload).catch((e) => {
        console.warn("[tts] playback failed:", e);
      });
    });
    return () => {
      p.then((fn) => fn());
    };
  }, []);

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
            const next = (t ?? "") + e.text;
            avatarState.onToken(next);
            return next;
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
      setRoute(null);
    }, ms);
  };

  const handleSubmit = async (text: string) => {
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    setInputOpen(false);
    setBubbleText("");
    setThinking(true);
    setRoute(null);
    avatarState.setThinking();
    try {
      const id = await sendMessage(text);
      activeIdRef.current = id;
    } catch (err) {
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
    setRoute(null);
    setThinking(false);
  };

  return (
    <>
      <AvatarStage modelUrl={settings?.live2d_model_url ?? null} />
      <ChatBubble text={bubbleText} route={route} thinking={thinking} />
      <InputField
        open={inputOpen}
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
