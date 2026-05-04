import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  deleteAsset,
  downloadAsset,
  listAssets,
  setLocalModel,
  setPiperVoice,
  setWhisperModel,
  type Asset,
  type PublicSettings,
} from "../../api";
import { t, useLocale } from "../../i18n";
import AssetCard from "./AssetCard";
import ImageGenPanel from "./ImageGenPanel";
import { useDownloadProgress } from "./useDownloadProgress";

interface Props {
  open: boolean;
  onClose: () => void;
  onSettingsChanged: () => void;
  settings: PublicSettings | null;
}

/**
 * Floating panel that lists installable AI assets (LLMs, voices, STT
 * models) and offers an image-generation tab. The wizard is purely a
 * UI shell: every action delegates to the Rust side via `../api`.
 */
export default function ModelWizard({
  open,
  onClose,
  onSettingsChanged,
  settings,
}: Props) {
  useLocale();
  const [assets, setAssets] = useState<Asset[]>([]);
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

  const { progress, clearFor } = useDownloadProgress({
    onFinished: () => {
      refresh();
      onSettingsChanged();
    },
  });

  const handleDownload = async (a: Asset) => {
    await downloadAsset(a.id);
  };

  const handleDelete = async (a: Asset) => {
    const ok = window.confirm(t("wizard.confirm.delete", { title: a.title }));
    if (!ok) return;
    try {
      await deleteAsset(a.id);
      flash(t("wizard.toast.deleted", { title: a.title }));
      clearFor(a.file_name);
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
    if (a.kind === "whisper_ggml")
      return settings.whisper_model_path === a.path;
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
          <div style={{ opacity: 0.65, fontSize: 11 }}>{t("wizard.info")}</div>
          <div style={{ display: "flex", gap: 6 }}>
            {(
              [
                ["models", t("wizard.tab.models")],
                ["imagegen", t("wizard.tab.imagegen")],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k as "models" | "imagegen")}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background:
                    tab === k
                      ? "rgba(255,255,255,0.18)"
                      : "rgba(255,255,255,0.04)",
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
            assets.map((a) => (
              <AssetCard
                key={a.id}
                asset={a}
                progress={progress[a.file_name]}
                active={isActive(a)}
                onDownload={handleDownload}
                onUseAsLocal={handleUseAsLocal}
                onUseAsVoice={handleUseAsVoice}
                onUseAsStt={handleUseAsStt}
                onDelete={handleDelete}
              />
            ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
