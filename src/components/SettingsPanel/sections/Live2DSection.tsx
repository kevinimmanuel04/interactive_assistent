import { useEffect, useState } from "react";
import { setLive2dModel, type PublicSettings } from "../../../api";
import ExternalLink from "../../ExternalLink";
import { t, useLocale } from "../../../i18n";
import { inputStyle } from "../styles";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function Live2DSection({ settings, refresh }: Props) {
  useLocale();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUrl(settings?.live2d_model_url ?? "");
  }, [settings?.live2d_model_url]);

  const save = async (value: string) => {
    setBusy(true);
    try {
      await setLive2dModel(value);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        {t("settings.live2d.label")}{" "}
        {settings?.live2d_model_url && (
          <span style={{ color: "#a5d6a7" }}>{t("settings.status.set")}</span>
        )}
      </div>
      <input
        type="text"
        placeholder={t("settings.live2d.placeholder")}
        value={url}
        disabled={busy}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => url !== (settings?.live2d_model_url ?? "") && save(url)}
        style={inputStyle}
      />
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
        {t("settings.live2d.hint")}{" "}
        <ExternalLink href="https://guansss.github.io/pixi-live2d-display/">
          pixi-live2d-display demo
        </ExternalLink>
        .
      </div>
    </div>
  );
}
