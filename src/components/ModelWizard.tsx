import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  Asset,
  DownloadEvent,
  deleteAsset,
  downloadAsset,
  listAssets,
  onModelProgress,
  PublicSettings,
  setLocalModel,
  setPiperVoice,
  setWhisperModel,
  setImagegenProvider,
  setImagegenLocalBinary,
  setImagegenLocalModel,
  setImagegenDevice,
  generateImage,
} from "../api";
import { t, useLocale } from "../i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  onSettingsChanged: () => void;
  settings: PublicSettings | null;
}

interface ProgressState {
  fileName: string;
  downloaded: number;
  total: number | null;
  state: "downloading" | "verifying" | "finished" | "failed";
  message?: string;
}

export default function ModelWizard({
  open,
  onClose,
  onSettingsChanged,
  settings,
}: Props) {
  useLocale();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [progress, setProgress] = useState<Record<string, ProgressState>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"models" | "imagegen">("models");

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2500);
  };

  const refresh = () => listAssets().then(setAssets).catch(() => {});

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  useEffect(() => {
    const p = onModelProgress((e: DownloadEvent) => {
      setProgress((prev) => {
        const next = { ...prev };
        switch (e.kind) {
          case "started":
            next[e.file_name] = {
              fileName: e.file_name,
              downloaded: e.resumed_from,
              total: e.total,
              state: "downloading",
            };
            break;
          case "progress":
            next[e.file_name] = {
              fileName: e.file_name,
              downloaded: e.downloaded,
              total: e.total,
              state: "downloading",
            };
            break;
          case "verifying":
            next[e.file_name] = {
              ...(next[e.file_name] ?? {
                fileName: e.file_name,
                downloaded: 0,
                total: null,
                state: "downloading",
              }),
              state: "verifying",
            };
            break;
          case "finished":
            next[e.file_name] = {
              ...(next[e.file_name] ?? {
                fileName: e.file_name,
                downloaded: 0,
                total: null,
                state: "finished",
              }),
              state: "finished",
            };
            refresh();
            onSettingsChanged();
            break;
          case "failed":
            next[e.file_name] = {
              fileName: e.file_name,
              downloaded: 0,
              total: null,
              state: "failed",
              message: e.message,
            };
            break;
        }
        return next;
      });
    });
    return () => {
      p.then((fn) => fn());
    };
  }, [onSettingsChanged]);

  const handleDownload = async (a: Asset) => {
    await downloadAsset(a.id);
  };

  const handleDelete = async (a: Asset) => {
    const ok = window.confirm(t("wizard.confirm.delete", { title: a.title }));
    if (!ok) return;
    try {
      await deleteAsset(a.id);
      flash(t("wizard.toast.deleted", { title: a.title }));
      setProgress((prev) => {
        const next = { ...prev };
        delete next[a.file_name];
        return next;
      });
      refresh();
      onSettingsChanged();
    } catch (e) {
      console.error("[wizard] delete_asset failed", e);
      flash(t("wizard.toast.failed", { err: String(e) }));
    }
  };

  const handleUseAsLocal = async (a: Asset) => {
    try {
      await setLocalModel(a.id);
      flash(t("wizard.toast.llm_set", { title: a.title }));
      onSettingsChanged();
    } catch (e) {
      console.error("[wizard] set_local_model failed", e);
      flash(t("wizard.toast.failed", { err: String(e) }));
    }
  };

  const handleUseAsVoice = async (a: Asset) => {
    if (!a.path) {
      flash(t("wizard.toast.asset_missing"));
      return;
    }
    try {
      await setPiperVoice(a.path);
      flash(t("wizard.toast.voice_set", { title: a.title }));
      onSettingsChanged();
    } catch (e) {
      console.error("[wizard] set_piper_voice failed", e);
      flash(t("wizard.toast.failed", { err: String(e) }));
    }
  };

  const handleUseAsStt = async (a: Asset) => {
    if (!a.path) {
      flash(t("wizard.toast.asset_missing"));
      return;
    }
    try {
      await setWhisperModel(a.path);
      flash(t("wizard.toast.stt_set", { title: a.title }));
      onSettingsChanged();
    } catch (e) {
      console.error("[wizard] set_whisper_model failed", e);
      flash(t("wizard.toast.failed", { err: String(e) }));
    }
  };

  const isActive = (a: Asset): boolean => {
    if (!a.path || !settings) return false;
    if (a.kind === "llm_gguf") return settings.local_model_path === a.path;
    if (a.kind === "piper_voice") return settings.piper_voice_path === a.path;
    if (a.kind === "whisper_ggml") return settings.whisper_model_path === a.path;
    return false;
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="wizard"
          className="interactive"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          style={{
            position: "absolute",
            top: 60,
            left: 12,
            right: 12,
            maxHeight: "80vh",
            overflowY: "auto",
            padding: 14,
            borderRadius: 12,
            background: "rgba(18, 18, 26, 0.92)",
            color: "#fff",
            fontSize: 13,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <strong>{t("wizard.title")}</strong>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#aaa",
                cursor: "pointer",
                fontSize: 16,
              }}
              aria-label={t("common.close")}
            >
              ×
            </button>
          </div>
          <div style={{ opacity: 0.65, fontSize: 11 }}>
            {t("wizard.info")}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {([
              ["models", t("wizard.tab.models")],
              ["imagegen", t("wizard.tab.imagegen")],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k as "models" | "imagegen")}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background:
                    tab === k ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.04)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {toast && (
            <div
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                background: "rgba(139, 195, 74, 0.18)",
                border: "1px solid rgba(139, 195, 74, 0.35)",
                fontSize: 12,
              }}
            >
              {toast}
            </div>
          )}
          {tab === "imagegen" && (
            <ImageGenPanel
              settings={settings}
              onSettingsChanged={onSettingsChanged}
              flash={flash}
            />
          )}
          {tab === "models" &&
            assets.map((a) => {
            const st = progress[a.file_name];
            const pct =
              st && st.total ? Math.round((st.downloaded / st.total) * 100) : null;
            return (
              <div
                key={a.id}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{a.title}</div>
                    <div style={{ opacity: 0.7, fontSize: 11 }}>
                      {a.description}
                    </div>
                    <div style={{ opacity: 0.5, fontSize: 11, marginTop: 2 }}>
                      ~{a.approx_size_mb} MB
                      {a.installed && " • installed"}
                      {isActive(a) && (
                        <span style={{ color: "#a5d6a7" }}> • active</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {!a.installed && (
                      <button
                        onClick={() => handleDownload(a)}
                        disabled={
                          !!st && (st.state === "downloading" || st.state === "verifying")
                        }
                        style={btn()}
                      >
                        {t("wizard.btn.download")}
                      </button>
                    )}
                    {a.installed && a.kind === "llm_gguf" && (
                      <button onClick={() => handleUseAsLocal(a)} style={btn()}>
                        {t("wizard.btn.use_local")}
                      </button>
                    )}
                    {a.installed && a.kind === "piper_voice" && (
                      <button onClick={() => handleUseAsVoice(a)} style={btn()}>
                        {t("wizard.btn.use_voice")}
                      </button>
                    )}
                    {a.installed && a.kind === "whisper_ggml" && (
                      <button onClick={() => handleUseAsStt(a)} style={btn()}>
                        {t("wizard.btn.use_stt")}
                      </button>
                    )}
                    {a.installed && (
                      <button
                        onClick={() => handleDelete(a)}
                        style={btn("danger")}
                        title={t("wizard.delete.tip")}
                      >
                        {t("wizard.btn.delete")}
                      </button>
                    )}
                  </div>
                </div>
                {st && (
                  <div style={{ marginTop: 8 }}>
                    {st.state === "downloading" && (
                      <>
                        <div
                          style={{
                            height: 4,
                            borderRadius: 2,
                            background: "rgba(255,255,255,0.1)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${pct ?? 0}%`,
                              height: "100%",
                              background: "rgba(255,255,255,0.55)",
                              transition: "width 0.2s linear",
                            }}
                          />
                        </div>
                        <div style={{ opacity: 0.6, fontSize: 11, marginTop: 4 }}>
                          {formatMB(st.downloaded)}
                          {st.total ? ` / ${formatMB(st.total)} (${pct}%)` : ""}
                        </div>
                      </>
                    )}
                    {st.state === "verifying" && (
                      <div style={{ opacity: 0.7, fontSize: 11 }}>{t("wizard.progress.verifying")}</div>
                    )}
                    {st.state === "finished" && (
                      <div style={{ color: "#a5d6a7", fontSize: 11 }}>{t("wizard.progress.done")}</div>
                    )}
                    {st.state === "failed" && (
                      <div style={{ color: "#ef9a9a", fontSize: 11 }}>
                        {t("wizard.progress.failed", { err: st.message ?? "" })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ImageGenPanel({
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

  const card: React.CSSProperties = {
    padding: 10,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
  };
  const lbl: React.CSSProperties = {
    fontSize: 11,
    opacity: 0.7,
    marginTop: 6,
    marginBottom: 2,
    display: "block",
  };
  const inp: React.CSSProperties = {
    width: "100%",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "#fff",
    padding: "5px 8px",
    fontSize: 12,
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{t("wizard.imagegen.provider")}</div>
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
                  provider === p ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.05)",
                color: "#fff",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {p}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, opacity: 0.55, marginTop: 6, lineHeight: 1.4 }}>
          Cloud providers (OpenRouter, Replicate) need API keys configured in
          Settings. Local needs an external <code>sd.exe</code> binary built from{" "}
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
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Local stable-diffusion.cpp</div>
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
          <div style={{ fontSize: 10, opacity: 0.55, marginTop: 6, lineHeight: 1.4 }}>
            {t("wizard.imagegen.tip")}
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{t("wizard.imagegen.test")}</div>
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
          {busy ? t("wizard.imagegen.test.busy") : t("wizard.imagegen.test.btn")}
        </button>
      </div>
    </div>
  );
}

function btn(variant: "default" | "danger" = "default"): React.CSSProperties {
  // Unified neutral style; `variant` retained for call-site compat but renders
  // the same tile so the UI stays monochrome.
  void variant;
  return {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(20,20,28,0.7)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 12,
  };
}

function formatMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  if (mb < 100) return `${mb.toFixed(1)} MB`;
  return `${mb.toFixed(0)} MB`;
}
