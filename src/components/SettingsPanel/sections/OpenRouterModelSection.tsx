// OpenRouter model picker. Lazy-loads the full catalogue (1000+ models)
// only when the user clicks "Load" — the API call is paid in latency, not
// dollars, but it's still polite to skip it on every panel mount.

import { useState } from "react";
import {
  listOpenRouterModels,
  setOpenRouterModel,
  type OpenRouterModel,
  type PublicSettings,
} from "../../../api";
import { t, useLocale } from "../../../i18n";
import { inputStyle } from "../styles";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function OpenRouterModelSection({ settings, refresh }: Props) {
  useLocale();
  const [models, setModels] = useState<OpenRouterModel[] | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await listOpenRouterModels();
      setModels(list);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  const filtered = (models ?? []).filter((m) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      m.id.toLowerCase().includes(needle) ||
      (m.name ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        {t("settings.or_picker.title")}{" "}
        <span style={{ opacity: 0.5, fontSize: 11 }}>
          {t("settings.or_picker.current", {
            model: settings?.openrouter_model ?? "—",
          })}
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input
          type="text"
          placeholder={t("settings.or_picker.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={load}
          disabled={loading || !settings?.has_openrouter_key}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.08)",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {loading
            ? "…"
            : models
              ? t("settings.or_picker.refresh")
              : t("settings.or_picker.load")}
        </button>
      </div>
      {err && (
        <div style={{ color: "#e57373", fontSize: 11, marginBottom: 6 }}>
          {err}
        </div>
      )}
      {!settings?.has_openrouter_key && (
        <div style={{ opacity: 0.5, fontSize: 11 }}>
          {t("settings.or_picker.hint")}
        </div>
      )}
      {models && (
        <div
          style={{
            maxHeight: 180,
            overflowY: "auto",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
          }}
        >
          {filtered.slice(0, 100).map((m) => {
            const active = settings?.openrouter_model === m.id;
            return (
              <button
                key={m.id}
                onClick={async () => {
                  await setOpenRouterModel(m.id);
                  await refresh();
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  background: active
                    ? "rgba(255,255,255,0.08)"
                    : "transparent",
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                <div>{m.name ?? m.id}</div>
                <div style={{ opacity: 0.5, fontSize: 11 }}>
                  {m.id}
                  {m.context_length ? ` • ${m.context_length} ctx` : ""}
                  {m.pricing?.prompt ? ` • $${m.pricing.prompt}/1M in` : ""}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ opacity: 0.5, fontSize: 11, padding: 8 }}>
              {t("settings.or_picker.no_matches")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
