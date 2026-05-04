import { t } from "../../i18n";
import type { Asset } from "../../api";
import { btn, formatMB, type ProgressState } from "./styles";

/**
 * One row of the asset list: name, description, size, the
 * download/use/delete actions, and (when a download is in flight) a
 * progress bar with status text.
 */
export default function AssetCard(props: {
  asset: Asset;
  progress: ProgressState | undefined;
  active: boolean;
  onDownload: (a: Asset) => void;
  onUseAsLocal: (a: Asset) => void;
  onUseAsVoice: (a: Asset) => void;
  onUseAsStt: (a: Asset) => void;
  onDelete: (a: Asset) => void;
}) {
  const {
    asset: a,
    progress: st,
    active,
    onDownload,
    onUseAsLocal,
    onUseAsVoice,
    onUseAsStt,
    onDelete,
  } = props;
  const pct = st && st.total ? Math.round((st.downloaded / st.total) * 100) : null;

  return (
    <div
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
          <div style={{ opacity: 0.7, fontSize: 11 }}>{a.description}</div>
          <div style={{ opacity: 0.5, fontSize: 11, marginTop: 2 }}>
            ~{a.approx_size_mb} MB
            {a.installed && " • installed"}
            {active && <span style={{ color: "#a5d6a7" }}> • active</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {!a.installed && (
            <button
              onClick={() => onDownload(a)}
              disabled={
                !!st && (st.state === "downloading" || st.state === "verifying")
              }
              style={btn()}
            >
              {t("wizard.btn.download")}
            </button>
          )}
          {a.installed && a.kind === "llm_gguf" && (
            <button onClick={() => onUseAsLocal(a)} style={btn()}>
              {t("wizard.btn.use_local")}
            </button>
          )}
          {a.installed && a.kind === "piper_voice" && (
            <button onClick={() => onUseAsVoice(a)} style={btn()}>
              {t("wizard.btn.use_voice")}
            </button>
          )}
          {a.installed && a.kind === "whisper_ggml" && (
            <button onClick={() => onUseAsStt(a)} style={btn()}>
              {t("wizard.btn.use_stt")}
            </button>
          )}
          {a.installed && (
            <button
              onClick={() => onDelete(a)}
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
            <div style={{ opacity: 0.7, fontSize: 11 }}>
              {t("wizard.progress.verifying")}
            </div>
          )}
          {st.state === "finished" && (
            <div style={{ color: "#a5d6a7", fontSize: 11 }}>
              {t("wizard.progress.done")}
            </div>
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
}
