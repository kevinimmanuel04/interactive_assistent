// OpenRouter cloud TTS form. Visible only when provider === "openrouter".
// The voice list is hardcoded to the OpenAI audio voice catalogue —
// OpenRouter routes voice tokens to the upstream provider, which (for now)
// is always OpenAI for the audio-preview models we support.

import { useEffect, useState } from "react";
import {
  setOpenRouterTtsEnabled,
  setOpenRouterTtsModel,
  setOpenRouterTtsVoice,
  type PublicSettings,
} from "../../../../api";
import { t, useLocale } from "../../../../i18n";
import ModelCombobox from "../../lib/ModelCombobox";
import { inputStyle, subCardStyle } from "../../styles";

const OPENAI_VOICES = [
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
] as const;

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function OpenRouterVoiceSection({ settings, refresh }: Props) {
  useLocale();
  const expanded = (settings?.tts_provider ?? "piper") === "openrouter";
  const hasKey = settings?.has_openrouter_key ?? false;
  const [enabled, setEnabled] = useState(
    settings?.openrouter_tts_enabled ?? false,
  );
  const [model, setModel] = useState(
    settings?.openrouter_tts_model ?? "openai/gpt-4o-audio-preview",
  );
  const [voice, setVoice] = useState(settings?.openrouter_tts_voice ?? "shimmer");
  const [busy, setBusy] = useState(false);

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
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const commitModel = async () => {
    setBusy(true);
    try {
      await setOpenRouterTtsModel(model);
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const commitVoice = async (v: string) => {
    setBusy(true);
    try {
      await setOpenRouterTtsVoice(v);
      setVoice(v);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={subCardStyle}>
      {!hasKey && (
        <div style={{ color: "#ffb74d", fontSize: 11, marginBottom: 6 }}>
          {t("settings.or_tts.no_key")}
        </div>
      )}
      <label
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy || !hasKey}
          onChange={(e) => commitEnabled(e.target.checked)}
        />
        {t("settings.or_tts.enable")}
      </label>
      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
        {t("settings.or_tts.model")}
      </div>
      <ModelCombobox
        value={model}
        onChange={setModel}
        onCommit={() => void commitModel()}
        kind="tts"
        enabled={hasKey && expanded}
        disabled={busy || !hasKey}
        placeholder="openai/gpt-4o-audio-preview"
        fallback={[
          "openai/gpt-4o-audio-preview",
          "openai/gpt-audio",
          "openai/gpt-audio-mini",
        ]}
      />
      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
        {t("settings.or_tts.voice")}
      </div>
      <select
        value={voice}
        disabled={busy || !hasKey}
        onChange={(e) => commitVoice(e.target.value)}
        style={inputStyle}
      >
        {OPENAI_VOICES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
        {t("settings.or_tts.hint")}
      </div>
    </div>
  );
}
