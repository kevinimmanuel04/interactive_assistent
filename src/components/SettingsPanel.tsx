import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  getSettings,
  Mode,
  PublicSettings,
  setClassifierModel,
  setLive2dModel,
  setMode,
  setOpenRouterKey,
  setPiperBinary,
  setPiperVoice,
  setSmartRouting,
  setTtsEnabled,
  setWakeWord,
  setWhisperModel,
} from "../api";

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export default function SettingsPanel({ open, onClose, onChanged }: Props) {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      getSettings().then(setSettings);
      setKeyInput("");
    }
  }, [open]);

  const onModeChange = async (mode: Mode) => {
    await setMode(mode);
    const next = await getSettings();
    setSettings(next);
    onChanged();
  };

  const onSaveKey = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      await setOpenRouterKey(keyInput.trim());
      const next = await getSettings();
      setSettings(next);
      setKeyInput("");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const onClearKey = async () => {
    await setOpenRouterKey("");
    const next = await getSettings();
    setSettings(next);
    onChanged();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="settings"
          className="interactive"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          style={{
            position: "absolute",
            top: 60,
            left: 12,
            right: 12,
            padding: 14,
            borderRadius: 12,
            background: "rgba(18, 18, 26, 0.9)",
            color: "#fff",
            fontSize: 13,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <strong>Settings</strong>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#aaa",
                cursor: "pointer",
                fontSize: 16,
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div>
            <div style={{ opacity: 0.7, marginBottom: 6 }}>Routing mode</div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["auto", "local", "cloud"] as const).map((m) => {
                const active = settings?.mode === m;
                return (
                  <button
                    key={m}
                    onClick={() => onModeChange(m)}
                    style={{
                      flex: 1,
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: active
                        ? "1px solid #b39ddb"
                        : "1px solid rgba(255,255,255,0.1)",
                      background: active ? "rgba(179,157,219,0.2)" : "transparent",
                      color: "#fff",
                      cursor: "pointer",
                      textTransform: "capitalize",
                    }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ opacity: 0.7, marginBottom: 6 }}>
              OpenRouter API key{" "}
              {settings?.has_openrouter_key && (
                <span style={{ color: "#a5d6a7" }}>• saved</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="password"
                placeholder={
                  settings?.has_openrouter_key ? "••••••••" : "sk-or-..."
                }
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(0,0,0,0.25)",
                  color: "#fff",
                  outline: "none",
                }}
              />
              <button
                disabled={saving || !keyInput.trim()}
                onClick={onSaveKey}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #b39ddb",
                  background: "rgba(179,157,219,0.2)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
              {settings?.has_openrouter_key && (
                <button
                  onClick={onClearKey}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "transparent",
                    color: "#e57373",
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
              Model: {settings?.openrouter_model ?? "…"}
            </div>
          </div>

          <TtsSection
            settings={settings}
            onChanged={async () => {
              const next = await getSettings();
              setSettings(next);
              onChanged();
            }}
          />

          <Live2DSection
            settings={settings}
            onChanged={async () => {
              const next = await getSettings();
              setSettings(next);
              onChanged();
            }}
          />

          <SttSection
            settings={settings}
            onChanged={async () => {
              const next = await getSettings();
              setSettings(next);
              onChanged();
            }}
          />

          <WakeWordSection
            settings={settings}
            onChanged={async () => {
              const next = await getSettings();
              setSettings(next);
              onChanged();
            }}
          />

          <SmartRoutingSection
            settings={settings}
            onChanged={async () => {
              const next = await getSettings();
              setSettings(next);
              onChanged();
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Live2DSection({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUrl(settings?.live2d_model_url ?? "");
  }, [settings?.live2d_model_url]);

  const save = async (value: string) => {
    setBusy(true);
    try {
      await setLive2dModel(value);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        Avatar — Live2D model URL{" "}
        {settings?.live2d_model_url && (
          <span style={{ color: "#a5d6a7" }}>• set</span>
        )}
      </div>
      <input
        type="text"
        placeholder="/live2d/haru/haru.model3.json"
        value={url}
        disabled={busy}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() =>
          url !== (settings?.live2d_model_url ?? "") && save(url)
        }
        style={inputStyle}
      />
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
        Drop a Cubism 3/4 model folder into <code>public/live2d/</code> and{" "}
        <code>live2dcubismcore.min.js</code> from the Live2D SDK into{" "}
        <code>public/</code>. See <code>public/live2d/README.md</code>.
      </div>
    </div>
  );
}

function TtsSection({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const [binary, setBinary] = useState("");
  const [voice, setVoice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBinary(settings?.piper_binary_path ?? "");
    setVoice(settings?.piper_voice_path ?? "");
  }, [settings?.piper_binary_path, settings?.piper_voice_path]);

  const enabled = settings?.tts_enabled ?? false;
  const ready =
    !!settings?.piper_binary_path && !!settings?.piper_voice_path;

  const save = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span style={{ opacity: 0.7 }}>
          Voice output (Piper){" "}
          {ready && <span style={{ color: "#a5d6a7" }}>• configured</span>}
        </span>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: ready ? "pointer" : "not-allowed",
            opacity: ready ? 1 : 0.5,
          }}
          title={ready ? "" : "Set binary and voice paths first"}
        >
          <input
            type="checkbox"
            checked={enabled}
            disabled={!ready || busy}
            onChange={(e) => save(() => setTtsEnabled(e.target.checked))}
          />
          <span>{enabled ? "On" : "Off"}</span>
        </label>
      </div>
      <input
        type="text"
        placeholder="Path to piper.exe"
        value={binary}
        onChange={(e) => setBinary(e.target.value)}
        onBlur={() =>
          binary !== (settings?.piper_binary_path ?? "") &&
          save(() => setPiperBinary(binary))
        }
        style={inputStyle}
      />
      <input
        type="text"
        placeholder="Path to <voice>.onnx"
        value={voice}
        onChange={(e) => setVoice(e.target.value)}
        onBlur={() =>
          voice !== (settings?.piper_voice_path ?? "") &&
          save(() => setPiperVoice(voice))
        }
        style={{ ...inputStyle, marginTop: 6 }}
      />
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
        Download voices from the Models panel (⬇). Piper binary:{" "}
        <span style={{ color: "#b39ddb" }}>github.com/rhasspy/piper</span>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(0,0,0,0.25)",
  color: "#fff",
  outline: "none",
  fontSize: 12,
  boxSizing: "border-box",
};

function SttSection({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPath(settings?.whisper_model_path ?? "");
  }, [settings?.whisper_model_path]);

  const save = async (value: string) => {
    setBusy(true);
    try {
      await setWhisperModel(value);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const available = settings?.stt_available ?? false;

  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        Speech-to-text — Whisper model path{" "}
        {settings?.whisper_model_path && (
          <span style={{ color: "#a5d6a7" }}>• set</span>
        )}
        {!available && (
          <span style={{ color: "#ffb74d", marginLeft: 6 }}>
            • build without <code>stt</code> feature
          </span>
        )}
      </div>
      <input
        type="text"
        placeholder="ggml-base.en.bin path (or use the wizard)"
        value={path}
        disabled={busy}
        onChange={(e) => setPath(e.target.value)}
        onBlur={() =>
          path !== (settings?.whisper_model_path ?? "") && save(path)
        }
        style={inputStyle}
      />
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
        Download a Whisper ggml model via the wizard, then click "Use as STT
        model". A 🎙 button will appear in the input field.
      </div>
    </div>
  );
}

function WakeWordSection({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPhrase(settings?.wake_word ?? "");
  }, [settings?.wake_word]);

  const save = async (value: string) => {
    setBusy(true);
    try {
      await setWakeWord(value);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        Wake word{" "}
        {settings?.wake_word && (
          <span style={{ color: "#a5d6a7" }}>• set</span>
        )}
      </div>
      <input
        type="text"
        placeholder='e.g. "Komorebi" (leave empty to disable)'
        value={phrase}
        disabled={busy}
        onChange={(e) => setPhrase(e.target.value)}
        onBlur={() => phrase !== (settings?.wake_word ?? "") && save(phrase)}
        style={inputStyle}
      />
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
        In continuous-listen mode, transcripts must contain this phrase to be
        sent. Leave empty to send every utterance. Simple case-insensitive
        substring match — no ML model, just a gate.
      </div>
    </div>
  );
}

function SmartRoutingSection({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const enabled = settings?.smart_routing ?? false;
  const hasKey = settings?.has_openrouter_key ?? false;

  useEffect(() => {
    setModel(settings?.classifier_model ?? "");
  }, [settings?.classifier_model]);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await setSmartRouting(on);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const saveModel = async (value: string) => {
    setBusy(true);
    try {
      await setClassifierModel(value);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        Smart routing{" "}
        {enabled && <span style={{ color: "#a5d6a7" }}>• on</span>}
      </div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy || !hasKey}
          onChange={(e) => toggle(e.target.checked)}
        />
        Use a small cloud model to pick Local vs Cloud
      </label>
      <input
        type="text"
        placeholder="meta-llama/llama-3.2-3b-instruct"
        value={model}
        disabled={busy || !enabled}
        onChange={(e) => setModel(e.target.value)}
        onBlur={() =>
          model !== (settings?.classifier_model ?? "") && saveModel(model)
        }
        style={inputStyle}
      />
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
        {hasKey
          ? "When Auto mode is active, a quick classifier call decides whether to use the local LLM or the cloud. Falls back to keyword rules on timeout. Skill detection stays keyword-based."
          : "Requires an OpenRouter API key."}
      </div>
    </div>
  );
}
