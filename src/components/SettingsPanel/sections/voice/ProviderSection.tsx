// TTS provider switcher: Piper (local), SoVITS (local server), OpenRouter
// (cloud). The OpenRouter button is disabled when no API key is saved.

import { setTtsProvider, type PublicSettings } from "../../../../api";
import { t, useLocale } from "../../../../i18n";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function ProviderSection({ settings, refresh }: Props) {
  useLocale();
  const provider = (settings?.tts_provider ?? "piper") as
    | "piper"
    | "sovits"
    | "openrouter";
  const hasKey = settings?.has_openrouter_key ?? false;

  const options = [
    ["piper", t("settings.tts.provider.piper"), true],
    ["sovits", t("settings.tts.provider.sovits"), true],
    ["openrouter", t("settings.tts.provider.openrouter"), hasKey],
  ] as const;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 4 }}>
        {t("settings.tts.provider")}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map(([p, label, enabled]) => (
          <button
            key={p}
            disabled={!enabled}
            title={!enabled ? t("settings.tts.provider.tip_no_key") : ""}
            onClick={async () => {
              await setTtsProvider(p);
              await refresh();
            }}
            style={{
              flex: "1 1 30%",
              padding: "6px 8px",
              borderRadius: 6,
              border:
                provider === p
                  ? "1px solid rgba(255,255,255,0.55)"
                  : "1px solid rgba(255,255,255,0.15)",
              background:
                provider === p ? "rgba(255,255,255,0.08)" : "transparent",
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
