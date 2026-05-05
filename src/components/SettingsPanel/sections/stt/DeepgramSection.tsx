// Deepgram cloud STT adapter. Requires a Deepgram API key (validated on
// save round-trip). Model + language lists are static — they reflect the
// public Deepgram model catalogue at the time of writing; users can type
// any custom model id which we render as a "(custom)" option.

import { useEffect, useState } from "react";
import {
  clearDeepgramKey,
  setDeepgramEnabled,
  setDeepgramKey,
  setDeepgramLanguage,
  setDeepgramModel,
  validateDeepgramKey,
  type PublicSettings,
} from "../../../../api";
import { t, useLocale } from "../../../../i18n";
import { toast } from "../../../Toast";
import { inputStyle, subCardStyle } from "../../styles";

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

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function DeepgramSection({ settings, refresh }: Props) {
  useLocale();
  const hasKey = settings?.has_deepgram_key ?? false;
  const [enabled, setEnabled] = useState(settings?.deepgram_enabled ?? false);
  const [keyInput, setKeyInput] = useState("");
  const [model, setModel] = useState(settings?.deepgram_model ?? "nova-3");
  const [language, setLanguage] = useState(
    settings?.deepgram_language ?? "multi",
  );
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
      await refresh();
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
      await refresh();
      toast.success("Deepgram key verified & saved");
    } catch (err) {
      setStatus(`❌ ${String(err)}`);
      toast.error(`Deepgram: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    setBusy(true);
    try {
      await clearDeepgramKey();
      setStatus("Key cleared");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const commitModel = async (next: string) => {
    setModel(next);
    await setDeepgramModel(next);
    await refresh();
  };
  const commitLang = async (next: string) => {
    setLanguage(next);
    await setDeepgramLanguage(next);
    await refresh();
  };

  return (
    <div style={subCardStyle}>
      <label
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy || !hasKey}
          onChange={(e) => toggle(e.target.checked)}
        />
        {t("settings.dg.enable")}
      </label>
      <div style={{ opacity: 0.6, fontSize: 11, marginTop: 4 }}>
        {t("settings.dg.hint")}
      </div>

      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
        {t("settings.dg.key")}{" "}
        {hasKey && (
          <span style={{ color: "#a5d6a7" }}>{t("settings.status.saved")}</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="password"
          placeholder={
            hasKey
              ? t("settings.dg.key.placeholder_saved")
              : t("settings.dg.key.placeholder_empty")
          }
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
          {t("settings.dg.save_test")}
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
              background: "rgba(255,255,255,0.06)",
            }}
          >
            {t("settings.dg.remove")}
          </button>
        )}
      </div>
      {status && (
        <div style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>{status}</div>
      )}

      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
        {t("settings.dg.model")}
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
        {t("settings.dg.lang")}
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
