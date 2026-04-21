import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  Asset,
  DownloadEvent,
  downloadAsset,
  listAssets,
  onModelProgress,
  setLocalModel,
  setPiperVoice,
  setWhisperModel,
} from "../api";

interface Props {
  open: boolean;
  onClose: () => void;
  onSettingsChanged: () => void;
}

interface ProgressState {
  fileName: string;
  downloaded: number;
  total: number | null;
  state: "downloading" | "verifying" | "finished" | "failed";
  message?: string;
}

export default function ModelWizard({ open, onClose, onSettingsChanged }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [progress, setProgress] = useState<Record<string, ProgressState>>({});

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

  const handleUseAsLocal = async (a: Asset) => {
    await setLocalModel(a.id);
    onSettingsChanged();
  };

  const handleUseAsVoice = async (a: Asset) => {
    if (!a.path) return;
    await setPiperVoice(a.path);
    onSettingsChanged();
  };

  const handleUseAsStt = async (a: Asset) => {
    if (!a.path) return;
    await setWhisperModel(a.path);
    onSettingsChanged();
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
            <strong>Model downloads</strong>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#aaa",
                cursor: "pointer",
                fontSize: 16,
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div style={{ opacity: 0.65, fontSize: 11 }}>
            Files are downloaded to your app-data folder. You can close this
            window — downloads continue in the background.
          </div>
          {assets.map((a) => {
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
                        Download
                      </button>
                    )}
                    {a.installed && a.kind === "llm_gguf" && (
                      <button onClick={() => handleUseAsLocal(a)} style={btn()}>
                        Use as local
                      </button>
                    )}
                    {a.installed && a.kind === "piper_voice" && (
                      <button onClick={() => handleUseAsVoice(a)} style={btn()}>
                        Use as voice
                      </button>
                    )}
                    {a.installed && a.kind === "whisper_ggml" && (
                      <button onClick={() => handleUseAsStt(a)} style={btn()}>
                        Use as STT model
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
                              background: "#b39ddb",
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
                      <div style={{ opacity: 0.7, fontSize: 11 }}>Verifying…</div>
                    )}
                    {st.state === "finished" && (
                      <div style={{ color: "#a5d6a7", fontSize: 11 }}>Done</div>
                    )}
                    {st.state === "failed" && (
                      <div style={{ color: "#ef9a9a", fontSize: 11 }}>
                        Failed: {st.message}
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

function btn(): React.CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid rgba(179,157,219,0.6)",
    background: "rgba(179,157,219,0.2)",
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
