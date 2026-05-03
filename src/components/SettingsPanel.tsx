import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import ExternalLink from "./ExternalLink";
import {
  FolderStats,
  getSettings,
  IndexReport,
  listAudioDevices,
  listOpenRouterModels,
  Mode,
  OpenRouterModel,
  PublicSettings,
  ragAddFolder,
  ragListFolders,
  ragReindex,
  ragRemoveFolder,
  setAudioInput,
  setAudioOutput,
  setAutoListen,
  setClassifierModel,
  setLive2dModel,
  setLlmGpuLayers,
  setMode,
  setOpenRouterKey,
  setOpenRouterModel,
  setPiperBinary,
  setPiperVoice,
  setRagEnabled,
  setSmartRouting,
  setTtsEnabled,
  setTtsProvider,
  setTtsProsody,
  setTtsVolume,
  setSovitsConfig,
  setOpenRouterTtsEnabled,
  setOpenRouterTtsModel,
  setOpenRouterTtsVoice,
  setOpenRouterSttEnabled,
  setOpenRouterSttModel,
  setFasterWhisperEnabled,
  setFasterWhisperUrl,
  setFasterWhisperModel,
  setFasterWhisperLanguage,
  validateFasterWhisper,
  setDeepgramKey,
  clearDeepgramKey,
  validateDeepgramKey,
  setDeepgramEnabled,
  setDeepgramModel,
  setDeepgramLanguage,
  setAvatarZoom,
  setAvatarOffset,
  setImagegenProvider,
  setImagegenOpenrouterModel,
  setImagegenReplicateModel,
  setImagegenLocalBinary,
  setImagegenLocalModel,
  setImagegenDevice,
  setImagegenSize,
  setImagegenSteps,
  setImagegenNegativePrompt,
  setReplicateToken,
  clearReplicateToken,
  setGameCoachEnabled,
  setGameCoachModel,
  setWakeWord,
  setWhisperModel,
  systemInfo,
  SystemInfo,
  setWeatherProvider,
  setWeatherApiKey,
  clearWeatherApiKey,
  setWeatherDefaultCity,
  setWeatherUseIp,
  setWeatherUnits,
  setUserName,
  setRelationshipVisibility,
  setRelationshipNsfwAllowed,
  setRelationshipDecayEnabled,
  resetRelationship,
  getRelationshipState,
  RelationshipState,
  STAGE_LABELS,
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

          <AvatarLayoutSection
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

          <GameCoachSection
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

          <HardwareSection
            settings={settings}
            onChanged={async () => {
              const next = await getSettings();
              setSettings(next);
              onChanged();
            }}
          />

          <OpenRouterModelSection
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

// Avatar zoom + offset live controls. The avatar is rendered via PIXI;
// these sliders push directly into the running scene without recreating
// the model, so dragging gives instant visual feedback.
function AvatarLayoutSection({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const [zoom, setZoom] = useState<number>(settings?.avatar_zoom ?? 1);
  const [ox, setOx] = useState<number>(settings?.avatar_offset_x ?? 0);
  const [oy, setOy] = useState<number>(settings?.avatar_offset_y ?? 0);

  useEffect(() => {
    setZoom(settings?.avatar_zoom ?? 1);
    setOx(settings?.avatar_offset_x ?? 0);
    setOy(settings?.avatar_offset_y ?? 0);
  }, [settings?.avatar_zoom, settings?.avatar_offset_x, settings?.avatar_offset_y]);

  // Persist on commit (pointer up). Live preview is driven by the local
  // state which flows back through getSettings → AvatarStage prop.
  const commitZoom = async (v: number) => {
    await setAvatarZoom(v);
    await onChanged();
  };
  const commitOffset = async (x: number, y: number) => {
    await setAvatarOffset(x, y);
    await onChanged();
  };

  return (
    <div style={{ marginTop: 10, padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
      <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 4 }}>
        Avatar size & position
      </div>
      <Slider
        label={`Zoom ×${zoom.toFixed(2)} (model size, independent of window)`}
        min={0.3}
        max={2.5}
        step={0.05}
        value={zoom}
        onChange={(v) => {
          setZoom(v);
          void commitZoom(v);
        }}
        onCommit={() => void commitZoom(zoom)}
      />
      <Slider
        label={`Horizontal nudge ${ox >= 0 ? "+" : ""}${ox.toFixed(2)}`}
        min={-1}
        max={1}
        step={0.02}
        value={ox}
        onChange={(v) => {
          setOx(v);
          void commitOffset(v, oy);
        }}
        onCommit={() => void commitOffset(ox, oy)}
      />
      <Slider
        label={`Vertical nudge ${oy >= 0 ? "+" : ""}${oy.toFixed(2)} (positive = down)`}
        min={-1}
        max={1}
        step={0.02}
        value={oy}
        onChange={(v) => {
          setOy(v);
          void commitOffset(ox, v);
        }}
        onCommit={() => void commitOffset(ox, oy)}
      />
      <button
        onClick={() => {
          setZoom(1);
          setOx(0);
          setOy(0);
          void commitZoom(1);
          void commitOffset(0, 0);
        }}
        style={{
          marginTop: 6,
          padding: "4px 10px",
          fontSize: 11,
          borderRadius: 4,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(255,255,255,0.06)",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Reset to fit
      </button>
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 4 }}>
        Resize the window from any edge — these values stay fixed, so the
        model keeps its real-pixel size while the window shrinks.
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

      <ProsodySection settings={settings} onChanged={onChanged} />
      <ProviderSection settings={settings} onChanged={onChanged} />
      <SoVitsSection settings={settings} onChanged={onChanged} />
      <OpenRouterVoiceSection settings={settings} onChanged={onChanged} />
    </div>
  );
}

// -------- Prosody (length / noise / volume) -------------------------------

function ProsodySection({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const [length, setLength] = useState<number>(settings?.tts_length_scale ?? 1);
  const [noise, setNoise] = useState<number>(settings?.tts_noise_scale ?? 0.667);
  const [noiseW, setNoiseW] = useState<number>(settings?.tts_noise_w ?? 0.8);
  const [volume, setVolume] = useState<number>(settings?.tts_volume ?? 1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLength(settings?.tts_length_scale ?? 1);
    setNoise(settings?.tts_noise_scale ?? 0.667);
    setNoiseW(settings?.tts_noise_w ?? 0.8);
    setVolume(settings?.tts_volume ?? 1);
  }, [
    settings?.tts_length_scale,
    settings?.tts_noise_scale,
    settings?.tts_noise_w,
    settings?.tts_volume,
  ]);

  const commitProsody = async () => {
    setBusy(true);
    try {
      await setTtsProsody(length, noise, noiseW);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };
  const commitVolume = async (v: number) => {
    await setTtsVolume(v);
    await onChanged();
  };

  return (
    <div style={{ marginTop: 10, padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
      <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 4 }}>
        Voice shape (Piper)
      </div>
      <Slider
        label={`Speed / pitch (length × ${length.toFixed(2)}) · smaller = faster & higher`}
        min={0.5}
        max={1.6}
        step={0.05}
        value={length}
        onChange={setLength}
        onCommit={commitProsody}
        disabled={busy}
      />
      <Slider
        label={`Expressiveness (noise ${noise.toFixed(2)})`}
        min={0.1}
        max={1.2}
        step={0.05}
        value={noise}
        onChange={setNoise}
        onCommit={commitProsody}
        disabled={busy}
      />
      <Slider
        label={`Rhythm variability (noise_w ${noiseW.toFixed(2)})`}
        min={0.1}
        max={1.2}
        step={0.05}
        value={noiseW}
        onChange={setNoiseW}
        onCommit={commitProsody}
        disabled={busy}
      />
      <Slider
        label={`Volume ${Math.round(volume * 100)}%`}
        min={0}
        max={1.5}
        step={0.05}
        value={volume}
        onChange={(v) => {
          setVolume(v);
          void commitVolume(v);
        }}
        onCommit={() => {}}
      />
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 4 }}>
        Tip: for a brighter, anime-ish delivery try length ≈ 0.85, noise ≈ 0.8.
      </div>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  onCommit,
  disabled,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  disabled?: boolean;
}) {
  return (
    <label style={{ display: "block", fontSize: 11, marginTop: 6 }}>
      <div style={{ opacity: 0.8, marginBottom: 2 }}>{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        style={{ width: "100%" }}
      />
    </label>
  );
}

// -------- Provider selector ----------------------------------------------

function ProviderSection({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const provider = (settings?.tts_provider ?? "piper") as "piper" | "sovits" | "openrouter";
  const hasKey = settings?.has_openrouter_key ?? false;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 4 }}>TTS provider</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {([
          ["piper", "Piper (local, light)", true],
          ["sovits", "GPT-SoVITS (external)", true],
          ["openrouter", "OpenRouter (cloud)", hasKey],
        ] as const).map(([p, label, enabled]) => (
          <button
            key={p}
            disabled={!enabled}
            title={!enabled ? "Set the OpenRouter API key first" : ""}
            onClick={async () => {
              await setTtsProvider(p);
              await onChanged();
            }}
            style={{
              flex: "1 1 30%",
              padding: "6px 8px",
              borderRadius: 6,
              border: provider === p ? "1px solid #8ab4f8" : "1px solid rgba(255,255,255,0.15)",
              background: provider === p ? "rgba(138,180,248,0.12)" : "transparent",
              color: enabled ? "#fff" : "rgba(255,255,255,0.4)",
              cursor: enabled ? "pointer" : "not-allowed",
              fontSize: 12,
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// -------- SoVITS form ----------------------------------------------------

function SoVitsSection({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const [endpoint, setEndpoint] = useState(settings?.sovits_endpoint ?? "http://127.0.0.1:9880");
  const [refAudio, setRefAudio] = useState(settings?.sovits_ref_audio ?? "");
  const [promptText, setPromptText] = useState(settings?.sovits_prompt_text ?? "");
  const [promptLang, setPromptLang] = useState(settings?.sovits_prompt_lang ?? "ja");
  const [textLang, setTextLang] = useState(settings?.sovits_text_lang ?? "auto");
  const [speed, setSpeed] = useState(settings?.sovits_speed ?? 1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEndpoint(settings?.sovits_endpoint ?? "http://127.0.0.1:9880");
    setRefAudio(settings?.sovits_ref_audio ?? "");
    setPromptText(settings?.sovits_prompt_text ?? "");
    setPromptLang(settings?.sovits_prompt_lang ?? "ja");
    setTextLang(settings?.sovits_text_lang ?? "auto");
    setSpeed(settings?.sovits_speed ?? 1);
  }, [
    settings?.sovits_endpoint,
    settings?.sovits_ref_audio,
    settings?.sovits_prompt_text,
    settings?.sovits_prompt_lang,
    settings?.sovits_text_lang,
    settings?.sovits_speed,
  ]);

  const save = async () => {
    setBusy(true);
    try {
      await setSovitsConfig({
        endpoint,
        refAudio,
        promptText,
        promptLang,
        textLang,
        speed,
      });
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const expanded = (settings?.tts_provider ?? "piper") === "sovits";
  if (!expanded) return null;

  return (
    <div style={{ marginTop: 10, padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
      <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 4 }}>
        GPT-SoVITS endpoint (external inference server)
      </div>
      <input
        type="text"
        placeholder="http://127.0.0.1:9880"
        value={endpoint}
        onChange={(e) => setEndpoint(e.target.value)}
        onBlur={save}
        style={inputStyle}
      />
      <input
        type="text"
        placeholder="Reference audio path (absolute path on the server)"
        value={refAudio}
        onChange={(e) => setRefAudio(e.target.value)}
        onBlur={save}
        style={{ ...inputStyle, marginTop: 6 }}
      />
      <input
        type="text"
        placeholder="Transcript of the reference clip"
        value={promptText}
        onChange={(e) => setPromptText(e.target.value)}
        onBlur={save}
        style={{ ...inputStyle, marginTop: 6 }}
      />
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <select
          value={promptLang}
          onChange={(e) => {
            setPromptLang(e.target.value);
            void save();
          }}
          style={{ ...inputStyle, flex: 1 }}
        >
          <option value="ja">Ref: Japanese</option>
          <option value="en">Ref: English</option>
          <option value="zh">Ref: Chinese</option>
          <option value="ru">Ref: Russian</option>
        </select>
        <select
          value={textLang}
          onChange={(e) => {
            setTextLang(e.target.value);
            void save();
          }}
          style={{ ...inputStyle, flex: 1 }}
        >
          <option value="auto">Text: auto-detect</option>
          <option value="ja">Text: Japanese</option>
          <option value="en">Text: English</option>
          <option value="zh">Text: Chinese</option>
          <option value="ru">Text: Russian</option>
        </select>
      </div>
      <Slider
        label={`Speed ×${speed.toFixed(2)}`}
        min={0.5}
        max={2}
        step={0.05}
        value={speed}
        onChange={setSpeed}
        onCommit={save}
        disabled={busy}
      />
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
        Run GPT-SoVITS separately from{" "}
        <ExternalLink href="https://github.com/RVC-Boss/GPT-SoVITS">
          RVC-Boss/GPT-SoVITS
        </ExternalLink>
        {" "}(`python api_v2.py` starts the FastAPI server on :9880). Point the
        reference-audio field at a 3–10 s anime/seiyuu clip and fill in its
        transcript; Komorebi POSTs text to <code>/tts</code> and plays the
        returned WAV.
      </div>
    </div>
  );
}

// -------- OpenRouter cloud TTS form ---------------------------------------

// Cached + filtered OpenRouter model list. `kind` selects models that
// support the relevant audio modality:
//   - "tts": output_modalities contains "audio"
//   - "stt": input_modalities  contains "audio"
function useFilteredOpenRouterModels(
  enabled: boolean,
  kind: "tts" | "stt"
): OpenRouterModel[] {
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  useEffect(() => {
    if (!enabled) {
      setModels([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await listOpenRouterModels();
        if (cancelled) return;
        const filtered = list.filter((m) => {
          const arch = m.architecture;
          if (!arch) return false;
          const mods =
            kind === "tts" ? arch.output_modalities : arch.input_modalities;
          return Array.isArray(mods) && mods.includes("audio");
        });
        // Sort: id alphabetical, but pin OpenAI audio models on top.
        filtered.sort((a, b) => {
          const ao = a.id.startsWith("openai/") ? 0 : 1;
          const bo = b.id.startsWith("openai/") ? 0 : 1;
          if (ao !== bo) return ao - bo;
          return a.id.localeCompare(b.id);
        });
        setModels(filtered);
      } catch {
        // Silently keep empty list — fallback hardcoded options will show.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, kind]);
  return models;
}

function OpenRouterVoiceSection({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const expanded = (settings?.tts_provider ?? "piper") === "openrouter";
  const hasKey = settings?.has_openrouter_key ?? false;
  const [enabled, setEnabled] = useState(settings?.openrouter_tts_enabled ?? false);
  const [model, setModel] = useState(settings?.openrouter_tts_model ?? "openai/gpt-4o-audio-preview");
  const [voice, setVoice] = useState(settings?.openrouter_tts_voice ?? "shimmer");
  const [busy, setBusy] = useState(false);
  const ttsModels = useFilteredOpenRouterModels(hasKey && expanded, "tts");

  useEffect(() => {
    setEnabled(settings?.openrouter_tts_enabled ?? false);
    setModel(settings?.openrouter_tts_model ?? "openai/gpt-4o-audio-preview");
    setVoice(settings?.openrouter_tts_voice ?? "alloy");
  }, [
    settings?.openrouter_tts_enabled,
    settings?.openrouter_tts_model,
    settings?.openrouter_tts_voice,
  ]);

  if (!expanded) return null;

  const commitEnabled = async (v: boolean) => {
    setBusy(true);
    try {
      await setOpenRouterTtsEnabled(v);
      setEnabled(v);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };
  const commitModel = async () => {
    setBusy(true);
    try {
      await setOpenRouterTtsModel(model);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };
  const commitVoice = async (v: string) => {
    setBusy(true);
    try {
      await setOpenRouterTtsVoice(v);
      setVoice(v);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 10, padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
      {!hasKey && (
        <div style={{ color: "#ffb74d", fontSize: 11, marginBottom: 6 }}>
          Set your OpenRouter API key above to enable cloud TTS.
        </div>
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy || !hasKey}
          onChange={(e) => commitEnabled(e.target.checked)}
        />
        Enable OpenRouter TTS
      </label>
      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
        TTS model
      </div>
      <input
        type="text"
        list="openrouter-tts-models"
        placeholder="openai/gpt-4o-audio-preview"
        value={model}
        disabled={busy || !hasKey}
        onChange={(e) => setModel(e.target.value)}
        onBlur={commitModel}
        style={inputStyle}
      />
      <datalist id="openrouter-tts-models">
        {ttsModels.length === 0 ? (
          <>
            <option value="openai/gpt-4o-audio-preview" />
            <option value="openai/gpt-audio" />
            <option value="openai/gpt-audio-mini" />
          </>
        ) : (
          ttsModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.id}
            </option>
          ))
        )}
      </datalist>
      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
        Voice
      </div>
      <select
        value={voice}
        disabled={busy || !hasKey}
        onChange={(e) => commitVoice(e.target.value)}
        style={inputStyle}
      >
        {[
          "alloy",
          "ash",
          "ballad",
          "coral",
          "echo",
          "fable",
          "nova",
          "onyx",
          "sage",
          "shimmer",
          "verse",
        ].map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
        Routes synthesis through OpenRouter using an audio-output-capable
        model. Piper still works as a local fallback when this provider is
        switched off.
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
  const hasKey = settings?.has_openrouter_key ?? false;
  const orEnabled = settings?.openrouter_stt_enabled ?? false;
  const orModel = settings?.openrouter_stt_model ?? "openai/gpt-4o-audio-preview";
  const sttModels = useFilteredOpenRouterModels(hasKey, "stt");

  const toggleOr = async (v: boolean) => {
    await setOpenRouterSttEnabled(v);
    await onChanged();
  };
  const commitOrModel = async (v: string) => {
    await setOpenRouterSttModel(v);
    await onChanged();
  };

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

      <div style={{ marginTop: 10, padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
        {!hasKey && (
          <div style={{ color: "#ffb74d", fontSize: 11, marginBottom: 6 }}>
            Set your OpenRouter API key above to enable cloud STT.
          </div>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={orEnabled}
            disabled={!hasKey}
            onChange={(e) => toggleOr(e.target.checked)}
          />
          Use OpenRouter STT (cloud) when enabled — falls back to Whisper if off
        </label>
        <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
          STT model
        </div>
        <input
          type="text"
          list="openrouter-stt-models"
          defaultValue={orModel}
          disabled={!hasKey}
          onBlur={(e) => {
            if (e.target.value !== orModel) commitOrModel(e.target.value);
          }}
          style={inputStyle}
        />
        <datalist id="openrouter-stt-models">
          {sttModels.length === 0 ? (
            <>
              <option value="openai/gpt-4o-audio-preview" />
              <option value="openai/gpt-audio" />
              <option value="openai/gpt-audio-mini" />
              <option value="google/gemini-2.5-flash" />
              <option value="google/gemini-2.0-flash-001" />
            </>
          ) : (
            sttModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.id}
              </option>
            ))
          )}
        </datalist>
      </div>

      <FasterWhisperBlock settings={settings} onChanged={onChanged} />
      <DeepgramBlock settings={settings} onChanged={onChanged} />
      <ImageGenBlock settings={settings} onChanged={onChanged} />
      <WeatherBlock settings={settings} onChanged={onChanged} />
      <RelationshipBlock settings={settings} onChanged={onChanged} />
    </div>
  );
}

function GameCoachSection({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const hasKey = settings?.has_openrouter_key ?? false;
  const enabled = settings?.game_coach_enabled ?? false;
  const model = settings?.game_coach_model ?? "openai/gpt-4o-mini";

  const toggle = async (v: boolean) => {
    await setGameCoachEnabled(v);
    await onChanged();
  };
  const commitModel = async (v: string) => {
    await setGameCoachModel(v);
    await onChanged();
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        Game Coach (vision)
      </div>
      <div style={{ padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
        {!hasKey && (
          <div style={{ color: "#ffb74d", fontSize: 11, marginBottom: 6 }}>
            Set your OpenRouter API key to use the vision-based coach.
          </div>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={!hasKey}
            onChange={(e) => toggle(e.target.checked)}
          />
          Watch the screen during games and whisper short tips
        </label>
        <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
          Vision model
        </div>
        <input
          type="text"
          list="game-coach-models"
          defaultValue={model}
          disabled={!hasKey}
          onBlur={(e) => {
            if (e.target.value !== model) commitModel(e.target.value);
          }}
          style={inputStyle}
        />
        <datalist id="game-coach-models">
          <option value="openai/gpt-4o-mini" />
          <option value="openai/gpt-4o" />
          <option value="google/gemini-2.5-flash" />
          <option value="anthropic/claude-3.5-sonnet" />
        </datalist>
        <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
          A screenshot is captured every ~30s only when a game window is focused.
          The image is downscaled to 960px before being sent.
        </div>
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
function HardwareSection({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const [devices, setDevices] = useState<{
    inputs: string[];
    outputs: string[];
    default_input: string | null;
    default_output: string | null;
  } | null>(null);
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listAudioDevices().then(setDevices).catch(() => {});
    systemInfo().then(setSys).catch(() => {});
  }, []);

  const inVal = settings?.audio_input_device ?? "";
  const outVal = settings?.audio_output_device ?? "";
  const gpuSetting = settings?.llm_gpu_layers;
  // null = auto; 0 = CPU; -1 / large = GPU all
  const gpuMode: "auto" | "cpu" | "gpu" =
    gpuSetting === null || gpuSetting === undefined
      ? "auto"
      : gpuSetting === 0
        ? "cpu"
        : "gpu";

  const setGpu = async (mode: "auto" | "cpu" | "gpu") => {
    setBusy(true);
    try {
      const v = mode === "auto" ? null : mode === "cpu" ? 0 : 999;
      await setLlmGpuLayers(v);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>Hardware & Audio devices</div>

      <div style={{ opacity: 0.5, fontSize: 11, marginBottom: 8 }}>
        {sys
          ? `${sys.os} • ${sys.cpu} (${sys.cpu_cores}c) • ${sys.ram_gb} GB RAM${
              sys.gpus.length ? ` • GPU: ${sys.gpus.join(", ")}` : ""
            }`
          : "…"}
      </div>

      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        <label style={{ opacity: 0.7, fontSize: 12 }}>Microphone input</label>
        <select
          value={inVal}
          disabled={busy || !devices}
          onChange={async (e) => {
            setBusy(true);
            try {
              await setAudioInput(e.target.value);
              await onChanged();
            } finally {
              setBusy(false);
            }
          }}
          style={inputStyle}
        >
          <option value="">
            System default
            {devices?.default_input ? ` (${devices.default_input})` : ""}
          </option>
          {devices?.inputs.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        <label style={{ opacity: 0.7, fontSize: 12 }}>Speaker output</label>
        <select
          value={outVal}
          disabled={busy || !devices}
          onChange={async (e) => {
            setBusy(true);
            try {
              await setAudioOutput(e.target.value);
              await onChanged();
            } finally {
              setBusy(false);
            }
          }}
          style={inputStyle}
        >
          <option value="">
            System default
            {devices?.default_output ? ` (${devices.default_output})` : ""}
          </option>
          {devices?.outputs.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ opacity: 0.7, fontSize: 12 }}>
          Local LLM acceleration
        </label>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {(["auto", "cpu", "gpu"] as const).map((m) => {
            const active = gpuMode === m;
            const disabled =
              m === "gpu" && sys !== null && sys.has_nvidia === false;
            return (
              <button
                key={m}
                disabled={busy || disabled}
                onClick={() => setGpu(m)}
                title={
                  m === "gpu" && disabled
                    ? "No NVIDIA GPU detected."
                    : undefined
                }
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: active
                    ? "1px solid #b39ddb"
                    : "1px solid rgba(255,255,255,0.1)",
                  background: active
                    ? "rgba(179,157,219,0.2)"
                    : "transparent",
                  color: disabled ? "#666" : "#fff",
                  cursor: disabled ? "not-allowed" : "pointer",
                  textTransform: "uppercase",
                  fontSize: 11,
                }}
              >
                {m === "auto" ? "Auto" : m === "cpu" ? "CPU" : "GPU"}
              </button>
            );
          })}
        </div>
        <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
          Auto picks GPU if an NVIDIA card is detected, otherwise runs on CPU.
        </div>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          opacity: 0.9,
        }}
      >
        <input
          type="checkbox"
          checked={settings?.auto_listen ?? false}
          disabled={busy}
          onChange={async (e) => {
            setBusy(true);
            try {
              await setAutoListen(e.target.checked);
              await onChanged();
            } finally {
              setBusy(false);
            }
          }}
        />
        Auto-listen after replies (re-arms the mic when the assistant finishes
        speaking)
      </label>
    </div>
  );
}

function OpenRouterModelSection({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const [models, setModels] = useState<OpenRouterModel[] | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await listOpenRouterModels();
      setModels(list);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  const filtered = (models ?? []).filter((m) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      m.id.toLowerCase().includes(needle) ||
      (m.name ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        OpenRouter model picker{" "}
        <span style={{ opacity: 0.5, fontSize: 11 }}>
          (current: {settings?.openrouter_model ?? "—"})
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input
          type="text"
          placeholder="Search (e.g. llama, sonnet, free)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={load}
          disabled={loading || !settings?.has_openrouter_key}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.08)",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {loading ? "…" : models ? "Refresh" : "Load"}
        </button>
      </div>
      {err && (
        <div style={{ color: "#e57373", fontSize: 11, marginBottom: 6 }}>
          {err}
        </div>
      )}
      {!settings?.has_openrouter_key && (
        <div style={{ opacity: 0.5, fontSize: 11 }}>
          Save an OpenRouter API key above to browse available models.
        </div>
      )}
      {models && (
        <div
          style={{
            maxHeight: 180,
            overflowY: "auto",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
          }}
        >
          {filtered.slice(0, 100).map((m) => {
            const active = settings?.openrouter_model === m.id;
            return (
              <button
                key={m.id}
                onClick={async () => {
                  await setOpenRouterModel(m.id);
                  await onChanged();
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  background: active
                    ? "rgba(179,157,219,0.18)"
                    : "transparent",
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                <div>{m.name ?? m.id}</div>
                <div style={{ opacity: 0.5, fontSize: 11 }}>
                  {m.id}
                  {m.context_length ? ` • ${m.context_length} ctx` : ""}
                  {m.pricing?.prompt ? ` • $${m.pricing.prompt}/1M in` : ""}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ opacity: 0.5, fontSize: 11, padding: 8 }}>
              No matches.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------- Faster-Whisper -----------------------------

function FasterWhisperBlock({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const [enabled, setEnabled] = useState(settings?.faster_whisper_enabled ?? false);
  const [url, setUrl] = useState(settings?.faster_whisper_url ?? "http://localhost:8000");
  const [model, setModel] = useState(
    settings?.faster_whisper_model ?? "Systran/faster-whisper-base"
  );
  const [language, setLanguage] = useState(settings?.faster_whisper_language ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnabled(settings?.faster_whisper_enabled ?? false);
    setUrl(settings?.faster_whisper_url ?? "http://localhost:8000");
    setModel(settings?.faster_whisper_model ?? "Systran/faster-whisper-base");
    setLanguage(settings?.faster_whisper_language ?? "");
  }, [
    settings?.faster_whisper_enabled,
    settings?.faster_whisper_url,
    settings?.faster_whisper_model,
    settings?.faster_whisper_language,
  ]);

  const toggle = async (v: boolean) => {
    setBusy(true);
    try {
      await setFasterWhisperEnabled(v);
      setEnabled(v);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };
  const commitUrl = async () => {
    await setFasterWhisperUrl(url);
    await onChanged();
  };
  const commitModel = async () => {
    await setFasterWhisperModel(model);
    await onChanged();
  };
  const commitLang = async () => {
    await setFasterWhisperLanguage(language);
    await onChanged();
  };
  const test = async () => {
    setStatus("Checking…");
    setBusy(true);
    try {
      await validateFasterWhisper(url);
      setStatus("✅ Reachable");
    } catch (err) {
      setStatus(`❌ ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 10,
        padding: 8,
        background: "rgba(255,255,255,0.03)",
        borderRadius: 6,
      }}
    >
      <label
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
        />
        Use Faster-Whisper (local server, ~4× faster than bundled Whisper)
      </label>
      <div style={{ opacity: 0.6, fontSize: 11, marginTop: 4 }}>
        Run{" "}
        <ExternalLink href="https://github.com/speaches-ai/speaches">
          speaches
        </ExternalLink>{" "}
        / faster-whisper-server locally (Docker or pip), then point Komorebi at
        its URL. Free, fully offline once a model is pulled.
      </div>
      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
        Server URL
      </div>
      <input
        type="text"
        placeholder="http://localhost:8000"
        value={url}
        disabled={busy}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => url !== (settings?.faster_whisper_url ?? "") && commitUrl()}
        style={inputStyle}
      />
      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
        Model
      </div>
      <input
        type="text"
        list="faster-whisper-models"
        placeholder="Systran/faster-whisper-base"
        value={model}
        disabled={busy}
        onChange={(e) => setModel(e.target.value)}
        onBlur={() => model !== (settings?.faster_whisper_model ?? "") && commitModel()}
        style={inputStyle}
      />
      <datalist id="faster-whisper-models">
        <option value="Systran/faster-whisper-tiny" />
        <option value="Systran/faster-whisper-base" />
        <option value="Systran/faster-whisper-small" />
        <option value="Systran/faster-whisper-medium" />
        <option value="Systran/faster-whisper-large-v3" />
        <option value="Systran/faster-distil-whisper-large-v3" />
      </datalist>
      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
        Language (blank = autodetect)
      </div>
      <input
        type="text"
        list="faster-whisper-langs"
        placeholder="auto"
        value={language}
        disabled={busy}
        onChange={(e) => setLanguage(e.target.value)}
        onBlur={() =>
          language !== (settings?.faster_whisper_language ?? "") && commitLang()
        }
        style={inputStyle}
      />
      <datalist id="faster-whisper-langs">
        <option value="en" />
        <option value="ru" />
        <option value="auto" />
      </datalist>
      <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={test}
          disabled={busy}
          style={{
            ...inputStyle,
            cursor: busy ? "wait" : "pointer",
            width: "auto",
            padding: "4px 10px",
          }}
        >
          Test connection
        </button>
        {status && (
          <span style={{ fontSize: 11, opacity: 0.85 }}>{status}</span>
        )}
      </div>
    </div>
  );
}

// ----------------------------- Deepgram -----------------------------------

function DeepgramBlock({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const hasKey = settings?.has_deepgram_key ?? false;
  const [enabled, setEnabled] = useState(settings?.deepgram_enabled ?? false);
  const [keyInput, setKeyInput] = useState("");
  const [model, setModel] = useState(settings?.deepgram_model ?? "nova-3");
  const [language, setLanguage] = useState(settings?.deepgram_language ?? "multi");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnabled(settings?.deepgram_enabled ?? false);
    setModel(settings?.deepgram_model ?? "nova-3");
    setLanguage(settings?.deepgram_language ?? "multi");
  }, [
    settings?.deepgram_enabled,
    settings?.deepgram_model,
    settings?.deepgram_language,
  ]);

  const toggle = async (v: boolean) => {
    setBusy(true);
    try {
      await setDeepgramEnabled(v);
      setEnabled(v);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const saveKey = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setStatus("Validating…");
    setBusy(true);
    try {
      await validateDeepgramKey(trimmed);
      await setDeepgramKey(trimmed);
      setKeyInput("");
      setStatus("✅ Saved & verified");
      await onChanged();
    } catch (err) {
      setStatus(`❌ ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    setBusy(true);
    try {
      await clearDeepgramKey();
      setStatus("Key cleared");
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const commitModel = async (next: string) => {
    setModel(next);
    await setDeepgramModel(next);
    await onChanged();
  };
  const commitLang = async (next: string) => {
    setLanguage(next);
    await setDeepgramLanguage(next);
    await onChanged();
  };

  const DEEPGRAM_MODELS: Array<{ value: string; label: string }> = [
    { value: "nova-3", label: "nova-3 — latest, best accuracy (recommended)" },
    { value: "nova-3-medical", label: "nova-3-medical — medical domain" },
    { value: "nova-2", label: "nova-2 — previous gen, multilingual" },
    { value: "nova-2-meeting", label: "nova-2-meeting — meetings / conferences" },
    { value: "nova-2-phonecall", label: "nova-2-phonecall — phone audio" },
    { value: "nova-2-finance", label: "nova-2-finance — finance domain" },
    { value: "nova-2-medical", label: "nova-2-medical — medical domain" },
    { value: "nova", label: "nova — original Nova" },
    { value: "enhanced", label: "enhanced — legacy enhanced model" },
    { value: "base", label: "base — legacy base model" },
  ];

  const DEEPGRAM_LANGUAGES: Array<{ value: string; label: string }> = [
    { value: "multi", label: "multi — auto-detect (Nova-3 only)" },
    { value: "en", label: "English (en)" },
    { value: "en-US", label: "English – US (en-US)" },
    { value: "en-GB", label: "English – UK (en-GB)" },
    { value: "ru", label: "Russian (ru)" },
    { value: "es", label: "Spanish (es)" },
    { value: "de", label: "German (de)" },
    { value: "fr", label: "French (fr)" },
    { value: "it", label: "Italian (it)" },
    { value: "pt", label: "Portuguese (pt)" },
    { value: "nl", label: "Dutch (nl)" },
    { value: "pl", label: "Polish (pl)" },
    { value: "tr", label: "Turkish (tr)" },
    { value: "uk", label: "Ukrainian (uk)" },
    { value: "ja", label: "Japanese (ja)" },
    { value: "ko", label: "Korean (ko)" },
    { value: "zh", label: "Chinese (zh)" },
    { value: "zh-CN", label: "Chinese – Simplified (zh-CN)" },
    { value: "hi", label: "Hindi (hi)" },
    { value: "ar", label: "Arabic (ar)" },
  ];

  return (
    <div
      style={{
        marginTop: 10,
        padding: 8,
        background: "rgba(255,255,255,0.03)",
        borderRadius: 6,
      }}
    >
      <label
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy || !hasKey}
          onChange={(e) => toggle(e.target.checked)}
        />
        Use Deepgram STT (cloud, ~$0.004/min — cheapest realtime tier)
      </label>
      <div style={{ opacity: 0.6, fontSize: 11, marginTop: 4 }}>
        Get a key at{" "}
        <ExternalLink href="https://console.deepgram.com/signup">
          console.deepgram.com
        </ExternalLink>{" "}
        ($200 free credits on signup).
      </div>

      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
        API key {hasKey && <span style={{ color: "#a5d6a7" }}>• saved</span>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="password"
          placeholder={hasKey ? "(stored — paste new key to replace)" : "Deepgram API key"}
          value={keyInput}
          disabled={busy}
          onChange={(e) => setKeyInput(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="button"
          onClick={saveKey}
          disabled={busy || !keyInput.trim()}
          style={{
            ...inputStyle,
            cursor: busy ? "wait" : "pointer",
            width: "auto",
            padding: "4px 10px",
          }}
        >
          Save & test
        </button>
        {hasKey && (
          <button
            type="button"
            onClick={removeKey}
            disabled={busy}
            style={{
              ...inputStyle,
              cursor: busy ? "wait" : "pointer",
              width: "auto",
              padding: "4px 10px",
              background: "rgba(226,74,74,0.25)",
            }}
          >
            Remove
          </button>
        )}
      </div>
      {status && (
        <div style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>{status}</div>
      )}

      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
        Model
      </div>
      <select
        value={model}
        disabled={busy || !hasKey}
        onChange={(e) => commitModel(e.target.value)}
        style={inputStyle}
      >
        {DEEPGRAM_MODELS.every((m) => m.value !== model) && (
          <option value={model}>{model} (custom)</option>
        )}
        {DEEPGRAM_MODELS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
        Language
      </div>
      <select
        value={language}
        disabled={busy || !hasKey}
        onChange={(e) => commitLang(e.target.value)}
        style={inputStyle}
      >
        {DEEPGRAM_LANGUAGES.every((l) => l.value !== language) && (
          <option value={language}>{language} (custom)</option>
        )}
        {DEEPGRAM_LANGUAGES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}


// ----------------------------- Image generation ---------------------------

function ImageGenBlock({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void;
}) {
  const provider = (settings?.imagegen_provider ?? "openrouter") as
    | "openrouter"
    | "replicate"
    | "local";
  const [orModel, setOrModel] = useState(
    settings?.imagegen_openrouter_model ?? "google/gemini-2.5-flash-image-preview",
  );
  const [repModel, setRepModel] = useState(
    settings?.imagegen_replicate_model ?? "black-forest-labs/flux-schnell",
  );
  const [bin, setBin] = useState(settings?.imagegen_local_binary ?? "");
  const [model, setModel] = useState(settings?.imagegen_local_model ?? "");
  const [device, setDevice] = useState(
    (settings?.imagegen_device ?? "auto") as "auto" | "cpu" | "cuda",
  );
  const [width, setWidth] = useState(settings?.imagegen_width ?? 768);
  const [height, setHeight] = useState(settings?.imagegen_height ?? 768);
  const [steps, setSteps] = useState(settings?.imagegen_steps ?? 20);
  const [neg, setNeg] = useState(settings?.imagegen_negative_prompt ?? "");
  const [token, setToken] = useState("");

  useEffect(() => {
    setOrModel(settings?.imagegen_openrouter_model ?? "google/gemini-2.5-flash-image-preview");
    setRepModel(settings?.imagegen_replicate_model ?? "black-forest-labs/flux-schnell");
    setBin(settings?.imagegen_local_binary ?? "");
    setModel(settings?.imagegen_local_model ?? "");
    setDevice((settings?.imagegen_device ?? "auto") as "auto" | "cpu" | "cuda");
    setWidth(settings?.imagegen_width ?? 768);
    setHeight(settings?.imagegen_height ?? 768);
    setSteps(settings?.imagegen_steps ?? 20);
    setNeg(settings?.imagegen_negative_prompt ?? "");
  }, [
    settings?.imagegen_openrouter_model,
    settings?.imagegen_replicate_model,
    settings?.imagegen_local_binary,
    settings?.imagegen_local_model,
    settings?.imagegen_device,
    settings?.imagegen_width,
    settings?.imagegen_height,
    settings?.imagegen_steps,
    settings?.imagegen_negative_prompt,
  ]);

  const change = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } finally {
      onChanged();
    }
  };

  return (
    <section style={sectionStyle}>
      <h3 style={h3Style}>Image generation</h3>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {(["openrouter", "replicate", "local"] as const).map((p) => (
          <button
            key={p}
            onClick={() => change(() => setImagegenProvider(p))}
            style={{
              flex: 1,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.15)",
              background:
                provider === p ? "rgba(179,157,219,0.35)" : "rgba(255,255,255,0.05)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {provider === "openrouter" && (
        <>
          <label style={lblStyle}>OpenRouter model</label>
          <input
            value={orModel}
            onChange={(e) => setOrModel(e.target.value)}
            onBlur={() => change(() => setImagegenOpenrouterModel(orModel))}
            placeholder="google/gemini-2.5-flash-image-preview"
            style={inpStyle}
          />
          <p style={hintStyle}>
            Uses your OpenRouter API key. Try: google/gemini-2.5-flash-image-preview,
            openai/dall-e-3.
          </p>
        </>
      )}

      {provider === "replicate" && (
        <>
          <label style={lblStyle}>Replicate API token</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              placeholder={
                settings?.has_replicate_token ? "(saved — leave blank)" : "r8_..."
              }
              style={{ ...inpStyle, flex: 1 }}
            />
            <button
              onClick={() =>
                change(async () => {
                  if (!token.trim()) return;
                  await setReplicateToken(token.trim());
                  setToken("");
                })
              }
              style={btnStyle}
            >
              Save
            </button>
            {settings?.has_replicate_token && (
              <button onClick={() => change(() => clearReplicateToken())} style={btnStyle}>
                Clear
              </button>
            )}
          </div>
          <label style={lblStyle}>Replicate model (owner/name[:version])</label>
          <input
            value={repModel}
            onChange={(e) => setRepModel(e.target.value)}
            onBlur={() => change(() => setImagegenReplicateModel(repModel))}
            placeholder="black-forest-labs/flux-schnell"
            style={inpStyle}
          />
        </>
      )}

      {provider === "local" && (
        <>
          <label style={lblStyle}>stable-diffusion.cpp binary (sd.exe)</label>
          <input
            value={bin}
            onChange={(e) => setBin(e.target.value)}
            onBlur={() => change(() => setImagegenLocalBinary(bin))}
            placeholder="C:\\tools\\sd.exe"
            style={inpStyle}
          />
          <label style={lblStyle}>Model file (.gguf / .safetensors)</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onBlur={() => change(() => setImagegenLocalModel(model))}
            placeholder="C:\\models\\sd15.q4.gguf"
            style={inpStyle}
          />
          <label style={lblStyle}>Device</label>
          <select
            value={device}
            onChange={(e) => {
              const v = e.target.value as "auto" | "cpu" | "cuda";
              setDevice(v);
              void change(() => setImagegenDevice(v));
            }}
            style={inpStyle}
          >
            <option value="auto">Auto (CUDA if available)</option>
            <option value="cpu">CPU only</option>
            <option value="cuda">NVIDIA CUDA</option>
          </select>
          <p style={hintStyle}>
            Build sd.exe from{" "}
            <ExternalLink href="https://github.com/leejet/stable-diffusion.cpp">
              stable-diffusion.cpp
            </ExternalLink>{" "}
            with `-DSD_CUDA=ON` for GPU.
          </p>
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <div style={{ flex: 1 }}>
          <label style={lblStyle}>Width</label>
          <input
            type="number"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value) || 0)}
            onBlur={() => change(() => setImagegenSize(width, height))}
            style={inpStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={lblStyle}>Height</label>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value) || 0)}
            onBlur={() => change(() => setImagegenSize(width, height))}
            style={inpStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={lblStyle}>Steps</label>
          <input
            type="number"
            value={steps}
            onChange={(e) => setSteps(Number(e.target.value) || 0)}
            onBlur={() => change(() => setImagegenSteps(steps))}
            style={inpStyle}
          />
        </div>
      </div>

      <label style={lblStyle}>Negative prompt (local / replicate)</label>
      <input
        value={neg}
        onChange={(e) => setNeg(e.target.value)}
        onBlur={() => change(() => setImagegenNegativePrompt(neg))}
        placeholder="blurry, low quality"
        style={inpStyle}
      />
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  marginTop: 14,
  paddingTop: 12,
  borderTop: "1px solid rgba(255,255,255,0.08)",
};
const h3Style: React.CSSProperties = {
  fontSize: 13,
  margin: "0 0 8px 0",
  letterSpacing: 0.4,
  textTransform: "uppercase",
  opacity: 0.85,
};
const lblStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  opacity: 0.7,
  marginTop: 6,
  marginBottom: 2,
};
const inpStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  color: "#fff",
  padding: "5px 8px",
  fontSize: 12,
  boxSizing: "border-box",
};
const btnStyle: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(179,157,219,0.25)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 12,
};
const hintStyle: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.55,
  margin: "4px 0 0 0",
  lineHeight: 1.4,
};

// --- Weather --------------------------------------------------------------

function WeatherBlock({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const [keyInput, setKeyInput] = useState("");
  const [city, setCity] = useState(settings?.weather_default_city ?? "");
  const provider = settings?.weather_provider ?? "openmeteo";
  const useIp = settings?.weather_use_ip ?? true;
  const units = settings?.weather_units ?? "metric";
  const hasKey = settings?.has_weather_api_key ?? false;
  useEffect(() => {
    setCity(settings?.weather_default_city ?? "");
  }, [settings?.weather_default_city]);

  return (
    <section style={sectionStyle}>
      <h3 style={h3Style}>🌤️ Weather</h3>
      <p style={hintStyle}>
        Komorebi can answer "погода в Берлине", "/weather Tokyo", or just
        "what's the weather". Open-Meteo is free and needs no key.
      </p>
      <label style={lblStyle}>Provider</label>
      <select
        value={provider}
        onChange={async (e) => {
          await setWeatherProvider(e.target.value as "openmeteo" | "openweathermap");
          await onChanged();
        }}
        style={inpStyle}
      >
        <option value="openmeteo">Open-Meteo (free, no key)</option>
        <option value="openweathermap">OpenWeatherMap (requires key)</option>
      </select>
      {provider === "openweathermap" && (
        <>
          <label style={lblStyle}>OpenWeatherMap API key {hasKey ? "✓" : "—"}</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="password"
              placeholder={hasKey ? "(saved — leave blank)" : "paste API key"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              style={{ ...inpStyle, flex: 1 }}
            />
            <button
              onClick={async () => {
                if (!keyInput.trim()) return;
                await setWeatherApiKey(keyInput.trim());
                setKeyInput("");
                await onChanged();
              }}
              style={btnStyle}
            >
              Save
            </button>
            {hasKey && (
              <button
                onClick={async () => {
                  await clearWeatherApiKey();
                  await onChanged();
                }}
                style={btnStyle}
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}
      <label style={lblStyle}>Default city (optional)</label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          placeholder="e.g. Berlin"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          style={{ ...inpStyle, flex: 1 }}
        />
        <button
          onClick={async () => {
            await setWeatherDefaultCity(city);
            await onChanged();
          }}
          style={btnStyle}
        >
          Save
        </button>
      </div>
      <label style={{ ...lblStyle, display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <input
          type="checkbox"
          checked={useIp}
          onChange={async (e) => {
            await setWeatherUseIp(e.target.checked);
            await onChanged();
          }}
        />
        <span>Auto-detect city via IP when not specified</span>
      </label>
      <label style={lblStyle}>Units</label>
      <select
        value={units}
        onChange={async (e) => {
          await setWeatherUnits(e.target.value as "metric" | "imperial");
          await onChanged();
        }}
        style={inpStyle}
      >
        <option value="metric">Metric (°C, m/s)</option>
        <option value="imperial">Imperial (°F, mph)</option>
      </select>
    </section>
  );
}

// --- Relationship ---------------------------------------------------------

function RelationshipBlock({
  settings,
  onChanged,
}: {
  settings: PublicSettings | null;
  onChanged: () => void | Promise<void>;
}) {
  const [name, setName] = useState(settings?.user_name ?? "");
  const [state, setState] = useState<RelationshipState | null>(null);
  const visibility = settings?.relationship_visibility ?? "indicator";
  const nsfw = settings?.relationship_nsfw_allowed ?? false;
  const decay = settings?.relationship_decay_enabled ?? true;

  useEffect(() => {
    setName(settings?.user_name ?? "");
  }, [settings?.user_name]);

  useEffect(() => {
    let cancelled = false;
    void getRelationshipState()
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [settings]);

  const stageMeta = state ? STAGE_LABELS[state.stage] : null;

  return (
    <section style={sectionStyle}>
      <h3 style={h3Style}>💞 Relationship</h3>
      <p style={hintStyle}>
        The assistant remembers how you treat her. Compliments, regular
        contact, and substantive conversation deepen affinity; rudeness and
        long silences pull it back. Stages alter tone, animations, and
        endearments.
      </p>
      {state && stageMeta && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "8px 0" }}>
          <div style={{ fontSize: 22 }}>{stageMeta.emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {stageMeta.ru} · {state.score} pts
            </div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>
              {state.total_interactions} interactions · streak {state.daily_streak}d
            </div>
          </div>
        </div>
      )}
      <label style={lblStyle}>Your name (optional)</label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          placeholder="How should she call you?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ ...inpStyle, flex: 1 }}
        />
        <button
          onClick={async () => {
            await setUserName(name);
            await onChanged();
          }}
          style={btnStyle}
        >
          Save
        </button>
      </div>
      <label style={lblStyle}>Indicator visibility</label>
      <select
        value={visibility}
        onChange={async (e) => {
          await setRelationshipVisibility(e.target.value as "indicator" | "hidden");
          await onChanged();
        }}
        style={inpStyle}
      >
        <option value="indicator">Show heart badge in top bar</option>
        <option value="hidden">Hide indicator</option>
      </select>
      <label style={{ ...lblStyle, display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <input
          type="checkbox"
          checked={decay}
          onChange={async (e) => {
            await setRelationshipDecayEnabled(e.target.checked);
            await onChanged();
          }}
        />
        <span>Slowly decay affinity during inactivity (~1 pt/day)</span>
      </label>
      {state && (state.stage === "romantic" || state.stage === "lover") && (
        <label style={{ ...lblStyle, display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={nsfw}
            onChange={async (e) => {
              await setRelationshipNsfwAllowed(e.target.checked);
              await onChanged();
            }}
          />
          <span>Allow flirty/intimate replies at high stages</span>
        </label>
      )}
      {state && state.events.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 11, opacity: 0.8 }}>
            Recent events ({state.events.length})
          </summary>
          <ul
            style={{
              maxHeight: 180,
              overflow: "auto",
              fontSize: 10,
              margin: "6px 0 0 0",
              padding: "0 0 0 16px",
              lineHeight: 1.5,
              opacity: 0.85,
            }}
          >
            {[...state.events].reverse().slice(0, 30).map((ev, i) => (
              <li key={i}>
                <span style={{ color: ev.delta >= 0 ? "#7fc97f" : "#e08585" }}>
                  {ev.delta >= 0 ? "+" : ""}
                  {ev.delta}
                </span>{" "}
                {ev.kind} — {ev.note}
              </li>
            ))}
          </ul>
        </details>
      )}
      <button
        onClick={async () => {
          if (!confirm("Reset relationship state to Stranger?")) return;
          await resetRelationship();
          await onChanged();
        }}
        style={{ ...btnStyle, marginTop: 8 }}
      >
        Reset relationship
      </button>
    </section>
  );
}
