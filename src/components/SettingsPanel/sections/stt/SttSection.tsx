// STT section: configures the bundled whisper.cpp model path plus the
// OpenRouter cloud STT toggle. Sub-sections (Faster-Whisper, Deepgram)
// are nested visually because they're alternative STT backends to the
// bundled whisper.cpp.
//
// Note: in the legacy monolith this section also rendered ImageGen,
// Language, Weather, Relationship, Community and Training blocks — none
// of which have anything to do with speech-to-text. Those have been
// hoisted to the top-level orchestrator so this section now contains
// strictly STT-relevant configuration.

import { useEffect, useState } from "react";
import {
  setOpenRouterSttEnabled,
  setOpenRouterSttModel,
  setWhisperModel,
  type PublicSettings,
} from "../../../../api";
import { t, useLocale } from "../../../../i18n";
import { useFilteredOpenRouterModels } from "../../lib/useFilteredOpenRouterModels";
import { inputStyle, subCardStyle } from "../../styles";
import DeepgramSection from "./DeepgramSection";
import FasterWhisperSection from "./FasterWhisperSection";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function SttSection({ settings, refresh }: Props) {
  useLocale();
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPath(settings?.whisper_model_path ?? "");
  }, [settings?.whisper_model_path]);

  const save = async (value: string) => {
    setBusy(true);
    try {
      await setWhisperModel(value);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const available = settings?.stt_available ?? false;
  const hasKey = settings?.has_openrouter_key ?? false;
  const orEnabled = settings?.openrouter_stt_enabled ?? false;
  const orModel =
    settings?.openrouter_stt_model ?? "openai/gpt-4o-audio-preview";
  const sttModels = useFilteredOpenRouterModels(hasKey, "stt");

  const toggleOr = async (v: boolean) => {
    await setOpenRouterSttEnabled(v);
    await refresh();
  };
  const commitOrModel = async (v: string) => {
    await setOpenRouterSttModel(v);
    await refresh();
  };

  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        {t("settings.stt.label")}{" "}
        {settings?.whisper_model_path && (
          <span style={{ color: "#a5d6a7" }}>{t("settings.status.set")}</span>
        )}
        {!available && (
          <span style={{ color: "#ffb74d", marginLeft: 6 }}>
            {t("settings.stt.warn_feature")}
          </span>
        )}
      </div>
      <input
        type="text"
        placeholder={t("settings.stt.placeholder")}
        value={path}
        disabled={busy}
        onChange={(e) => setPath(e.target.value)}
        onBlur={() =>
          path !== (settings?.whisper_model_path ?? "") && save(path)
        }
        style={inputStyle}
      />
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
        {t("settings.stt.hint")}
      </div>

      <div style={subCardStyle}>
        {!hasKey && (
          <div style={{ color: "#ffb74d", fontSize: 11, marginBottom: 6 }}>
            {t("settings.stt.or.no_key")}
          </div>
        )}
        <label
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
        >
          <input
            type="checkbox"
            checked={orEnabled}
            disabled={!hasKey}
            onChange={(e) => toggleOr(e.target.checked)}
          />
          {t("settings.stt.or.enable")}
        </label>
        <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
          {t("settings.stt.or.model")}
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

      <FasterWhisperSection settings={settings} refresh={refresh} />
      <DeepgramSection settings={settings} refresh={refresh} />
    </div>
  );
}
