import { useEffect, useState } from "react";
import { setWakeWord, type PublicSettings } from "../../../api";
import { t, useLocale } from "../../../i18n";
import { inputStyle } from "../styles";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function WakeWordSection({ settings, refresh }: Props) {
  useLocale();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPhrase(settings?.wake_word ?? "");
  }, [settings?.wake_word]);

  const save = async (value: string) => {
    setBusy(true);
    try {
      await setWakeWord(value);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        {t("settings.wake.label")}{" "}
        {settings?.wake_word && (
          <span style={{ color: "#a5d6a7" }}>{t("settings.status.set")}</span>
        )}
      </div>
      <input
        type="text"
        placeholder={t("settings.wake.placeholder")}
        value={phrase}
        disabled={busy}
        onChange={(e) => setPhrase(e.target.value)}
        onBlur={() => phrase !== (settings?.wake_word ?? "") && save(phrase)}
        style={inputStyle}
      />
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
        {t("settings.wake.hint")}
      </div>
    </div>
  );
}
