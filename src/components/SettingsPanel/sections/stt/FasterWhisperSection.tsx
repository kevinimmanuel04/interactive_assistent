// Faster-Whisper local server adapter. Faster-Whisper is a lightweight
// CTranslate2 reimplementation of OpenAI Whisper that runs as a local
// HTTP service. The user is responsible for running the server; we only
// need its URL plus the model id and language hint.

import { useEffect, useState } from "react";
import {
  setFasterWhisperEnabled,
  setFasterWhisperLanguage,
  setFasterWhisperModel,
  setFasterWhisperUrl,
  validateFasterWhisper,
  type PublicSettings,
} from "../../../../api";
import { t, useLocale } from "../../../../i18n";
import { inputStyle, subCardStyle } from "../../styles";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function FasterWhisperSection({ settings, refresh }: Props) {
  useLocale();
  const [enabled, setEnabled] = useState(
    settings?.faster_whisper_enabled ?? false,
  );
  const [url, setUrl] = useState(
    settings?.faster_whisper_url ?? "http://localhost:8000",
  );
  const [model, setModel] = useState(
    settings?.faster_whisper_model ?? "Systran/faster-whisper-base",
  );
  const [language, setLanguage] = useState(
    settings?.faster_whisper_language ?? "",
  );
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
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const commitUrl = async () => {
    await setFasterWhisperUrl(url);
    await refresh();
  };
  const commitModel = async () => {
    await setFasterWhisperModel(model);
    await refresh();
  };
  const commitLang = async () => {
    await setFasterWhisperLanguage(language);
    await refresh();
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
    <div style={subCardStyle}>
      <label
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
        />
        {t("settings.fw.enable")}
      </label>
      <div style={{ opacity: 0.6, fontSize: 11, marginTop: 4 }}>
        {t("settings.fw.hint")}
      </div>
      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
        {t("settings.fw.url")}
      </div>
      <input
        type="text"
        placeholder={t("settings.fw.url.placeholder")}
        value={url}
        disabled={busy}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() =>
          url !== (settings?.faster_whisper_url ?? "") && commitUrl()
        }
        style={inputStyle}
      />
      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
        {t("settings.fw.model")}
      </div>
      <input
        type="text"
        list="faster-whisper-models"
        placeholder={t("settings.fw.model.placeholder")}
        value={model}
        disabled={busy}
        onChange={(e) => setModel(e.target.value)}
        onBlur={() =>
          model !== (settings?.faster_whisper_model ?? "") && commitModel()
        }
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
        {t("settings.fw.lang")}
      </div>
      <input
        type="text"
        list="faster-whisper-langs"
        placeholder={t("settings.fw.lang.placeholder")}
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
      <div
        style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}
      >
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
          {t("settings.fw.test")}
        </button>
        {status && (
          <span style={{ fontSize: 11, opacity: 0.85 }}>{status}</span>
        )}
      </div>
    </div>
  );
}
