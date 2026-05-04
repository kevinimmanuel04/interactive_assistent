import { useEffect, useState } from "react";
import {
  generateImage,
  setImagegenDevice,
  setImagegenLocalBinary,
  setImagegenLocalModel,
  setImagegenProvider,
  type PublicSettings,
} from "../../api";
import { t, useLocale } from "../../i18n";
import { btn, card, inp, lbl } from "./styles";

/**
 * Image-generation tab: picks provider (OpenRouter / Replicate / Local),
 * configures the local stable-diffusion.cpp setup, and runs a smoke-test
 * prompt.
 */
export default function ImageGenPanel({
  settings,
  onSettingsChanged,
  flash,
}: {
  settings: PublicSettings | null;
  onSettingsChanged: () => void;
  flash: (msg: string) => void;
}) {
  useLocale();
  const provider = (settings?.imagegen_provider ?? "openrouter") as
    | "openrouter"
    | "replicate"
    | "local";
  const [bin, setBin] = useState(settings?.imagegen_local_binary ?? "");
  const [model, setModel] = useState(settings?.imagegen_local_model ?? "");
  const [device, setDevice] = useState(
    (settings?.imagegen_device ?? "auto") as "auto" | "cpu" | "cuda",
  );
  const [testPrompt, setTestPrompt] = useState("a cute orange cat");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBin(settings?.imagegen_local_binary ?? "");
    setModel(settings?.imagegen_local_model ?? "");
    setDevice((settings?.imagegen_device ?? "auto") as "auto" | "cpu" | "cuda");
  }, [
    settings?.imagegen_local_binary,
    settings?.imagegen_local_model,
    settings?.imagegen_device,
  ]);

  const pickFile = async (
    title: string,
    extensions: string[],
  ): Promise<string | null> => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open({
        multiple: false,
        title,
        filters: [{ name: title, extensions }],
      });
      if (typeof result === "string") return result;
      return null;
    } catch (e) {
      flash(`Pick failed: ${e}`);
      return null;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          {t("wizard.imagegen.provider")}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["openrouter", "replicate", "local"] as const).map((p) => (
            <button
              key={p}
              onClick={async () => {
                await setImagegenProvider(p);
                onSettingsChanged();
                flash(`Provider: ${p}`);
              }}
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
        <div
          style={{
            fontSize: 10,
            opacity: 0.55,
            marginTop: 6,
            lineHeight: 1.4,
          }}
        >
          Cloud providers (OpenRouter, Replicate) need API keys configured in
          Settings. Local needs an external <code>sd.exe</code> binary built
          from{" "}
          <a
            href="https://github.com/leejet/stable-diffusion.cpp"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#b39ddb" }}
          >
            stable-diffusion.cpp
          </a>
          .
        </div>
      </div>

      {provider === "local" && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Local stable-diffusion.cpp
          </div>
          <label style={lbl}>sd.exe binary</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={bin}
              onChange={(e) => setBin(e.target.value)}
              onBlur={async () => {
                await setImagegenLocalBinary(bin);
                onSettingsChanged();
              }}
              placeholder="C:\\tools\\sd.exe"
              style={{ ...inp, flex: 1 }}
            />
            <button
              onClick={async () => {
                const p = await pickFile("sd.exe", ["exe"]);
                if (p) {
                  setBin(p);
                  await setImagegenLocalBinary(p);
                  onSettingsChanged();
                  flash("Binary set");
                }
              }}
              style={btn()}
            >
              Browse…
            </button>
          </div>
          <label style={lbl}>Model file (.gguf / .safetensors / .ckpt)</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onBlur={async () => {
                await setImagegenLocalModel(model);
                onSettingsChanged();
              }}
              placeholder="C:\\models\\sd15.q4.gguf"
              style={{ ...inp, flex: 1 }}
            />
            <button
              onClick={async () => {
                const p = await pickFile("SD model", [
                  "gguf",
                  "safetensors",
                  "ckpt",
                  "bin",
                ]);
                if (p) {
                  setModel(p);
                  await setImagegenLocalModel(p);
                  onSettingsChanged();
                  flash("Model set");
                }
              }}
              style={btn()}
            >
              Browse…
            </button>
          </div>
          <label style={lbl}>Compute device</label>
          <select
            value={device}
            onChange={async (e) => {
              const v = e.target.value as "auto" | "cpu" | "cuda";
              setDevice(v);
              await setImagegenDevice(v);
              onSettingsChanged();
            }}
            style={inp}
          >
            <option value="auto">{t("wizard.imagegen.device.auto")}</option>
            <option value="cpu">{t("wizard.imagegen.device.cpu")}</option>
            <option value="cuda">{t("wizard.imagegen.device.cuda")}</option>
          </select>
          <div
            style={{
              fontSize: 10,
              opacity: 0.55,
              marginTop: 6,
              lineHeight: 1.4,
            }}
          >
            {t("wizard.imagegen.tip")}
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          {t("wizard.imagegen.test")}
        </div>
        <input
          value={testPrompt}
          onChange={(e) => setTestPrompt(e.target.value)}
          placeholder={t("wizard.imagegen.test.placeholder")}
          style={inp}
        />
        <button
          onClick={async () => {
            const p = testPrompt.trim();
            if (!p) return;
            setBusy(true);
            try {
              await generateImage(p);
              flash(t("wizard.imagegen.test.toast"));
            } catch (e) {
              flash(t("wizard.toast.failed", { err: String(e) }));
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          style={{ ...btn(), marginTop: 6 }}
        >
          {busy
            ? t("wizard.imagegen.test.busy")
            : t("wizard.imagegen.test.btn")}
        </button>
      </div>
    </div>
  );
}
