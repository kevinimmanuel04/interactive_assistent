// RAG: corpus management. Folders are indexed in the background by the
// Rust side; reindexAll() walks every registered folder and rewrites the
// embedding store. The progress UI is intentionally minimal — the backend
// returns a single summary report at the end of indexing.

import { useEffect, useState } from "react";
import {
  ragAddFolder,
  ragListFolders,
  ragReindex,
  ragRemoveFolder,
  setRagEnabled,
  type FolderStats,
  type PublicSettings,
} from "../../../api";
import { t, useLocale } from "../../../i18n";
import { reportSummary } from "../lib/reportSummary";
import { inputStyle } from "../styles";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function RagSection({ settings, refresh }: Props) {
  useLocale();
  const [folders, setFolders] = useState<FolderStats[]>([]);
  const [pathInput, setPathInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const enabled = settings?.rag_enabled ?? false;

  const reloadFolders = async () => {
    try {
      setFolders(await ragListFolders());
    } catch (e) {
      setStatus(String(e));
    }
  };

  useEffect(() => {
    reloadFolders();
  }, []);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await setRagEnabled(on);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const addFolder = async () => {
    const p = pathInput.trim();
    if (!p) return;
    setBusy(true);
    setStatus(null);
    try {
      await ragAddFolder(p);
      setPathInput("");
      await reloadFolders();
      const report = await ragReindex(p);
      setStatus(reportSummary(report));
      await reloadFolders();
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeFolder = async (p: string) => {
    setBusy(true);
    try {
      await ragRemoveFolder(p);
      await reloadFolders();
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  };

  const reindexAll = async () => {
    setBusy(true);
    setStatus("Reindexing…");
    try {
      const report = await ragReindex();
      setStatus(reportSummary(report));
      await reloadFolders();
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        {t("settings.rag.label")}{" "}
        {enabled && (
          <span style={{ color: "#a5d6a7" }}>{t("settings.status.on")}</span>
        )}
      </div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
        />
        {t("settings.rag.enable")}
      </label>

      {folders.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            marginBottom: 6,
          }}
        >
          {folders.map((f) => (
            <div
              key={f.path}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 6px",
                borderRadius: 6,
                background: "rgba(0,0,0,0.2)",
                fontSize: 12,
              }}
            >
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={f.path}
              >
                {f.path}
              </span>
              <span style={{ opacity: 0.55, fontSize: 11 }}>
                {t("settings.rag.folder_info", {
                  docs: String(f.doc_count),
                  chunks: String(f.chunk_count),
                })}
              </span>
              <button
                onClick={() => removeFolder(f.path)}
                disabled={busy}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#ddd",
                  borderRadius: 6,
                  padding: "2px 6px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {t("settings.rag.remove")}
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input
          type="text"
          placeholder={t("settings.rag.placeholder")}
          value={pathInput}
          disabled={busy}
          onChange={(e) => setPathInput(e.target.value)}
          style={inputStyle}
        />
        <button
          onClick={addFolder}
          disabled={busy || !pathInput.trim()}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {t("settings.rag.add")}
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          onClick={reindexAll}
          disabled={busy || folders.length === 0}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            cursor: folders.length === 0 ? "default" : "pointer",
          }}
        >
          {t("settings.rag.reindex")}
        </button>
        {status && <span style={{ opacity: 0.6, fontSize: 11 }}>{status}</span>}
      </div>

      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
        {t("settings.rag.hint")}
      </div>
    </div>
  );
}
