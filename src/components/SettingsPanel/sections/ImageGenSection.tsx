// Image generation: tri-mode provider picker (cloud via OpenRouter,
// cloud via Replicate, fully local via a user-supplied binary). Each
// branch shows only its own fields. Width / height / steps / negative
// prompt are universal across providers.

import { useEffect, useState } from "react";
import {
  clearReplicateToken,
  setImagegenDevice,
  setImagegenLocalBinary,
  setImagegenLocalModel,
  setImagegenNegativePrompt,
  setImagegenOpenrouterModel,
  setImagegenProvider,
  setImagegenReplicateModel,
  setImagegenSize,
  setImagegenSteps,
  setReplicateToken,
  type PublicSettings,
} from "../../../api";
import { t, useLocale } from "../../../i18n";
import { toast } from "../../Toast";
import ModelCombobox from "../lib/ModelCombobox";
import {
  btnStyle,
  h3Style,
  hintStyle,
  inputStyle,
  lblStyle,
  sectionStyle,
} from "../styles";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function ImageGenSection({ settings, refresh }: Props) {
  useLocale();
  const provider = (settings?.imagegen_provider ?? "openrouter") as
    | "openrouter"
    | "replicate"
    | "local";
  const [orModel, setOrModel] = useState(
    settings?.imagegen_openrouter_model ??
      "google/gemini-2.5-flash-image",
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
    setOrModel(
      settings?.imagegen_openrouter_model ??
        "google/gemini-2.5-flash-image",
    );
    setRepModel(
      settings?.imagegen_replicate_model ?? "black-forest-labs/flux-schnell",
    );
    setBin(settings?.imagegen_local_binary ?? "");
    setModel(settings?.imagegen_local_model ?? "");
    setDevice(
      (settings?.imagegen_device ?? "auto") as "auto" | "cpu" | "cuda",
    );
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

  // All writes funnel through this helper so refresh() always fires —
  // the legacy code did the same with a less-typed `change()` wrapper.
  const change = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } finally {
      await refresh();
    }
  };

  return (
    <section style={sectionStyle}>
      <h3 style={h3Style}>{t("settings.imggen.title")}</h3>
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
                provider === p
                  ? "rgba(255,255,255,0.18)"
                  : "rgba(255,255,255,0.05)",
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
          <label style={lblStyle}>{t("settings.imggen.openrouter.model")}</label>
          <ModelCombobox
            value={orModel}
            onChange={setOrModel}
            onCommit={(v) => change(() => setImagegenOpenrouterModel(v))}
            kind="image"
            enabled={settings?.has_openrouter_key ?? false}
            placeholder={t("settings.imggen.openrouter.placeholder")}
            fallback={[
              "black-forest-labs/flux-1.1-pro",
              "black-forest-labs/flux-schnell",
              "black-forest-labs/flux-dev",
              "stability-ai/sdxl",
            ]}
          />
          <p style={hintStyle}>{t("settings.imggen.openrouter.hint")}</p>
        </>
      )}

      {provider === "replicate" && (
        <>
          <label style={lblStyle}>{t("settings.imggen.replicate.token")}</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              placeholder={
                settings?.has_replicate_token
                  ? t("settings.imggen.replicate.token.placeholder_saved")
                  : t("settings.imggen.replicate.token.placeholder_empty")
              }
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={() =>
                change(async () => {
                  if (!token.trim()) return;
                  try {
                    await setReplicateToken(token.trim());
                    setToken("");
                    toast.success(t("settings.status.saved"));
                  } catch (err) {
                    toast.error(String(err));
                  }
                })
              }
              style={btnStyle}
            >
              {t("common.save")}
            </button>
            {settings?.has_replicate_token && (
              <button
                onClick={() => change(() => clearReplicateToken())}
                style={btnStyle}
              >
                {t("common.clear")}
              </button>
            )}
          </div>
          <label style={lblStyle}>{t("settings.imggen.replicate.model")}</label>
          <input
            value={repModel}
            onChange={(e) => setRepModel(e.target.value)}
            onBlur={() => change(() => setImagegenReplicateModel(repModel))}
            placeholder={t("settings.imggen.replicate.placeholder")}
            style={inputStyle}
          />
        </>
      )}

      {provider === "local" && (
        <>
          <label style={lblStyle}>{t("settings.imggen.local.binary")}</label>
          <input
            value={bin}
            onChange={(e) => setBin(e.target.value)}
            onBlur={() => change(() => setImagegenLocalBinary(bin))}
            placeholder={t("settings.imggen.local.binary.placeholder")}
            style={inputStyle}
          />
          <label style={lblStyle}>{t("settings.imggen.local.model")}</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onBlur={() => change(() => setImagegenLocalModel(model))}
            placeholder={t("settings.imggen.local.model.placeholder")}
            style={inputStyle}
          />
          <label style={lblStyle}>{t("settings.imggen.device")}</label>
          <select
            value={device}
            onChange={(e) => {
              const v = e.target.value as "auto" | "cpu" | "cuda";
              setDevice(v);
              void change(() => setImagegenDevice(v));
            }}
            style={inputStyle}
          >
            <option value="auto">{t("settings.imggen.device.auto")}</option>
            <option value="cpu">{t("settings.imggen.device.cpu")}</option>
            <option value="cuda">{t("settings.imggen.device.cuda")}</option>
          </select>
          <p style={hintStyle}>{t("settings.imggen.local.hint")}</p>
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <div style={{ flex: 1 }}>
          <label style={lblStyle}>{t("settings.imggen.width")}</label>
          <input
            type="number"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value) || 0)}
            onBlur={() => change(() => setImagegenSize(width, height))}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={lblStyle}>{t("settings.imggen.height")}</label>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value) || 0)}
            onBlur={() => change(() => setImagegenSize(width, height))}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={lblStyle}>{t("settings.imggen.steps")}</label>
          <input
            type="number"
            value={steps}
            onChange={(e) => setSteps(Number(e.target.value) || 0)}
            onBlur={() => change(() => setImagegenSteps(steps))}
            style={inputStyle}
          />
        </div>
      </div>

      <label style={lblStyle}>{t("settings.imggen.negative")}</label>
      <input
        value={neg}
        onChange={(e) => setNeg(e.target.value)}
        onBlur={() => change(() => setImagegenNegativePrompt(neg))}
        placeholder={t("settings.imggen.negative.placeholder")}
        style={inputStyle}
      />
    </section>
  );
}
