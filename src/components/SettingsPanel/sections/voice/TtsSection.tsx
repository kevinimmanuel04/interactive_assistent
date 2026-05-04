// TTS section: configures Piper binary + voice paths and the global TTS
// on/off switch. Renders nested provider-specific configs (Prosody is
// universal; Provider/SoVits/OpenRouter are provider-specific) directly
// below for compactness.
//
// The "ready" guard prevents enabling TTS without a voice model: Piper
// will fail to load otherwise. The bundled binary covers the binary path,
// so only the voice file is mandatory.

import { useEffect, useState } from "react";
import {
  setPiperBinary,
  setPiperVoice,
  setTtsEnabled,
  type PublicSettings,
} from "../../../../api";
import { t, useLocale } from "../../../../i18n";
import ExternalLink from "../../../ExternalLink";
import { inputStyle } from "../../styles";
import OpenRouterVoiceSection from "./OpenRouterVoiceSection";
import ProsodySection from "./ProsodySection";
import ProviderSection from "./ProviderSection";
import SoVitsSection from "./SoVitsSection";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function TtsSection({ settings, refresh }: Props) {
  useLocale();
  const [binary, setBinary] = useState("");
  const [voice, setVoice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBinary(settings?.piper_binary_path ?? "");
    setVoice(settings?.piper_voice_path ?? "");
  }, [settings?.piper_binary_path, settings?.piper_voice_path]);

  const enabled = settings?.tts_enabled ?? false;
  const ready = !!settings?.piper_voice_path;

  const save = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
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
          {t("settings.tts.title")}{" "}
          {ready && (
            <span style={{ color: "#a5d6a7" }}>
              {t("settings.status.configured")}
            </span>
          )}
        </span>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: ready ? "pointer" : "not-allowed",
            opacity: ready ? 1 : 0.5,
          }}
          title={ready ? "" : t("settings.tts.tip_disabled")}
        >
          <input
            type="checkbox"
            checked={enabled}
            disabled={!ready || busy}
            onChange={(e) => save(() => setTtsEnabled(e.target.checked))}
          />
          <span>{enabled ? t("settings.tts.on") : t("settings.tts.off")}</span>
        </label>
      </div>
      <input
        type="text"
        placeholder={t("settings.tts.binary.placeholder")}
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
        placeholder={t("settings.tts.voice.placeholder")}
        value={voice}
        onChange={(e) => setVoice(e.target.value)}
        onBlur={() =>
          voice !== (settings?.piper_voice_path ?? "") &&
          save(() => setPiperVoice(voice))
        }
        style={{ ...inputStyle, marginTop: 6 }}
      />
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
        {t("settings.tts.hint")}{" "}
        <ExternalLink href="https://github.com/OHF-Voice/piper1-gpl/releases">
          OHF-Voice/piper1-gpl
        </ExternalLink>
        .
      </div>

      <ProsodySection settings={settings} refresh={refresh} />
      <ProviderSection settings={settings} refresh={refresh} />
      <SoVitsSection settings={settings} refresh={refresh} />
      <OpenRouterVoiceSection settings={settings} refresh={refresh} />
    </div>
  );
}
