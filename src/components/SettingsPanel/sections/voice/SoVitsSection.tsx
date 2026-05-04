// SoVITS form. Visible only when provider === "sovits". Saves the entire
// config in a single round-trip via setSovitsConfig — the backend treats
// these fields as a unit (changing speed without ref_audio is ill-defined).

import { useEffect, useState } from "react";
import {
  setSovitsConfig,
  type PublicSettings,
} from "../../../../api";
import { t } from "../../../../i18n";
import ExternalLink from "../../../ExternalLink";
import Slider from "../../lib/Slider";
import { inputStyle, subCardStyle } from "../../styles";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function SoVitsSection({ settings, refresh }: Props) {
  const [endpoint, setEndpoint] = useState(
    settings?.sovits_endpoint ?? "http://127.0.0.1:9880",
  );
  const [refAudio, setRefAudio] = useState(settings?.sovits_ref_audio ?? "");
  const [promptText, setPromptText] = useState(
    settings?.sovits_prompt_text ?? "",
  );
  const [promptLang, setPromptLang] = useState(
    settings?.sovits_prompt_lang ?? "ja",
  );
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
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if ((settings?.tts_provider ?? "piper") !== "sovits") return null;

  return (
    <div style={subCardStyle}>
      <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 4 }}>
        {t("settings.sovits.title")}
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
        placeholder={t("settings.sovits.ref_audio.placeholder")}
        value={refAudio}
        onChange={(e) => setRefAudio(e.target.value)}
        onBlur={save}
        style={{ ...inputStyle, marginTop: 6 }}
      />
      <input
        type="text"
        placeholder={t("settings.sovits.prompt_text.placeholder")}
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
        label={t("settings.sovits.speed", { value: speed.toFixed(2) })}
        min={0.5}
        max={2}
        step={0.05}
        value={speed}
        onChange={setSpeed}
        onCommit={save}
        disabled={busy}
      />
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
        {t("settings.sovits.hint")}{" "}
        <ExternalLink href="https://github.com/RVC-Boss/GPT-SoVITS">
          RVC-Boss/GPT-SoVITS
        </ExternalLink>
      </div>
    </div>
  );
}
