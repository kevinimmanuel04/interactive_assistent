import { useCallback, useEffect, useRef, useState } from "react";
import AvatarStage from "./components/AvatarStage";
import ChatBubble from "./components/ChatBubble";
import InputField from "./components/InputField";
import ModelWizard from "./components/ModelWizard";
import SettingsPanel from "./components/SettingsPanel";
import { listen } from "@tauri-apps/api/event";
import {
  cancelGeneration,
  ChatEvent,
  getSettings,
  onChat,
  PublicSettings,
  resetChat,
  sendMessage,
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
  const activeIdRef = useRef<string | null>(null);
  const bubbleTimer = useRef<number | null>(null);

  // Load settings on mount.
  const refreshSettings = useCallback(() => {
    getSettings().then(setSettings).catch(() => {});
  }, []);
  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  // Global hotkey toggles input.
  useEffect(() => {
    const p = listen<string>("hotkey:toggle-input", () => {
      setInputOpen((v) => !v);
    });
    return () => {
      p.then((fn) => fn());
    };
  }, []);

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
          setBubbleText((t) => (t ?? "") + e.text);
          break;
        case "done":
          setThinking(false);
          scheduleBubbleHide();
          activeIdRef.current = null;
          break;
        case "error":
          setThinking(false);
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
    try {
      const id = await sendMessage(text);
      activeIdRef.current = id;
    } catch (err) {
      setThinking(false);
      setBubbleText(`⚠ ${String(err)}`);
      scheduleBubbleHide(6000);
    }
  };

  const handleReset = async () => {
    await cancelGeneration();
    await resetChat();
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
      />
      <TopBar
        mode={settings?.mode ?? "auto"}
        hasKey={settings?.has_openrouter_key ?? false}
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
  onToggleSettings: () => void;
  onToggleWizard: () => void;
  onReset: () => void;
}) {
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
        onClick={props.onReset}
        style={iconBtn}
        title="Reset conversation"
      >
        ↺
      </button>
      <button
        onClick={props.onToggleWizard}
        style={iconBtn}
        title="Model downloads"
      >
        ⬇
      </button>
      <button
        onClick={props.onToggleSettings}
        style={iconBtn}
        title="Settings"
      >
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
