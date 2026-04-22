import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import ExternalLink from "./ExternalLink";
import {
  FolderStats,
  getSettings,
  IndexReport,
  Mode,
  PublicSettings,
  ragAddFolder,
  ragListFolders,
  ragReindex,
  ragRemoveFolder,
  setClassifierModel,
  setLive2dModel,
  setMode,
  setOpenRouterKey,
  setPiperBinary,
  setPiperVoice,
  setRagEnabled,
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
            top: 48,
            left: 12,
            right: 12,
            bottom: 12,
            padding: 0,
            borderRadius: 14,
            background: "rgba(18, 18, 26, 0.92)",
            color: "#fff",
            fontSize: 13,
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              flexShrink: 0,
            }}
          >
            <strong style={{ fontSize: 14 }}>Settings</strong>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#aaa",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
                padding: 0,
                width: 24,
                height: 24,
                borderRadius: 6,
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div
            style={{
              overflowY: "auto",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              flex: 1,
              minHeight: 0,
            }}
          >

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

          <RagSection
            settings={settings}
            onChanged={async () => {
              const next = await getSettings();
              setSettings(next);
              onChanged();
            }}
          />
          </div>
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
        placeholder="https://.../model.model3.json or /live2d/.../model.model3.json"
        value={url}
        disabled={busy}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() =>
          url !== (settings?.live2d_model_url ?? "") && save(url)
        }
        style={inputStyle}
      />
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
        Supports Cubism 2 (<code>.model.json</code>) and 3/4 (
        <code>.model3.json</code>). The runtime is auto-fetched from CDN on
        first load. Try:{" "}
        <ExternalLink href="https://guansss.github.io/pixi-live2d-display/">
          pixi-live2d-display demo
        </ExternalLink>
        .
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
  // Binary path is optional: the app ships a bundled Piper. Only the voice
  // model is required to enable TTS.
  const ready = !!settings?.piper_voice_path;

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
        placeholder="Path to piper binary (optional — bundled by default)"
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
        Download voices from the Models panel (⬇). A Piper binary is bundled
        with the app; leave the first field empty to use it. Override with a
        custom build from{" "}
        <ExternalLink href="https://github.com/OHF-Voice/piper1-gpl/releases">
          OHF-Voice/piper1-gpl
        </ExternalLink>
        .
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

function RagSection({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const [folders, setFolders] = useState<FolderStats[]>([]);
  const [pathInput, setPathInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const enabled = settings?.rag_enabled ?? false;

  const refresh = async () => {
    try {
      setFolders(await ragListFolders());
    } catch (e) {
      setStatus(String(e));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await setRagEnabled(on);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const addFolder = async () => {
    const p = pathInput.trim();
    if (!p) return;
    setBusy(true);
    setStatus(null);
    try {
      await ragAddFolder(p);
      setPathInput("");
      await refresh();
      const report = await ragReindex(p);
      setStatus(reportSummary(report));
      await refresh();
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeFolder = async (p: string) => {
    setBusy(true);
    try {
      await ragRemoveFolder(p);
      await refresh();
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  };

  const reindexAll = async () => {
    setBusy(true);
    setStatus("Reindexing…");
    try {
      const report = await ragReindex();
      setStatus(reportSummary(report));
      await refresh();
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        Knowledge — local files (RAG){" "}
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
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
        />
        Use indexed folders as context for answers
      </label>

      {folders.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            marginBottom: 6,
          }}
        >
          {folders.map((f) => (
            <div
              key={f.path}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 6px",
                borderRadius: 6,
                background: "rgba(0,0,0,0.2)",
                fontSize: 12,
              }}
            >
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={f.path}
              >
                {f.path}
              </span>
              <span style={{ opacity: 0.55, fontSize: 11 }}>
                {f.doc_count} docs · {f.chunk_count} chunks
              </span>
              <button
                onClick={() => removeFolder(f.path)}
                disabled={busy}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#ddd",
                  borderRadius: 6,
                  padding: "2px 6px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input
          type="text"
          placeholder="C:\\path\\to\\folder"
          value={pathInput}
          disabled={busy}
          onChange={(e) => setPathInput(e.target.value)}
          style={inputStyle}
        />
        <button
          onClick={addFolder}
          disabled={busy || !pathInput.trim()}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Add
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          onClick={reindexAll}
          disabled={busy || folders.length === 0}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            cursor: folders.length === 0 ? "default" : "pointer",
          }}
        >
          Reindex all
        </button>
        {status && (
          <span style={{ opacity: 0.6, fontSize: 11 }}>{status}</span>
        )}
      </div>

      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
        Text files are split into chunks and indexed locally with SQLite
        FTS5. When enabled, the top matches for your prompt are prepended as
        context. Nothing leaves your machine for indexing.
      </div>
    </div>
  );
}

function reportSummary(r: IndexReport): string {
  return `${r.files_indexed} indexed · ${r.files_skipped} skipped · ${r.chunks_written} chunks`;
}