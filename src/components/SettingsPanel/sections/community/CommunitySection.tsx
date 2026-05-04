// Community telemetry (Phase 1 — see ADR 0003).
// Opt-in feedback queue: stores anonymized turn-level signals locally and
// uploads them in batches to the configured endpoint. Stats are polled
// every 30 seconds while the panel is open.

import { useCallback, useEffect, useState } from "react";
import {
  feedbackPurge,
  feedbackStats,
  setTelemetryEnabled,
  setTelemetryEndpoint,
  type FeedbackStats,
  type PublicSettings,
} from "../../../../api";
import { t, useLocale } from "../../../../i18n";
import {
  btnStyle,
  h3Style,
  hintStyle,
  inputStyle,
  sectionStyle,
} from "../../styles";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function CommunitySection({ settings, refresh }: Props) {
  useLocale();
  const enabled = !!settings?.telemetry_enabled;
  const endpoint = settings?.telemetry_endpoint ?? "";
  const token = settings?.anon_token ?? null;
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [endpointDraft, setEndpointDraft] = useState(endpoint);

  useEffect(() => {
    setEndpointDraft(endpoint);
  }, [endpoint]);

  const refreshStats = useCallback(() => {
    feedbackStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  useEffect(() => {
    refreshStats();
    const id = window.setInterval(refreshStats, 30_000);
    return () => window.clearInterval(id);
  }, [refreshStats]);

  return (
    <section style={sectionStyle}>
      <h3 style={h3Style}>🤝 {t("settings.community.title")}</h3>
      <p style={hintStyle}>{t("settings.community.hint")}</p>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={async (e) => {
            await setTelemetryEnabled(e.target.checked);
            await refresh();
            refreshStats();
          }}
        />
        <span>{t("settings.community.telemetry.enable")}</span>
      </label>
      <label
        style={{ display: "block", fontSize: 12, opacity: 0.75, marginTop: 6 }}
      >
        {t("settings.community.telemetry.endpoint")}
      </label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={endpointDraft}
          onChange={(e) => setEndpointDraft(e.target.value)}
          onBlur={async () => {
            if (endpointDraft !== endpoint) {
              await setTelemetryEndpoint(endpointDraft);
              await refresh();
            }
          }}
          style={{ ...inputStyle, flex: 1 }}
          placeholder="https://..."
        />
      </div>
      <p style={{ ...hintStyle, marginTop: 8 }}>
        {t("settings.community.telemetry.stats", {
          pending: String(stats?.pending ?? 0),
          uploaded: String(stats?.uploaded ?? 0),
        })}
      </p>
      {token && (
        <p style={{ ...hintStyle, fontFamily: "ui-monospace, monospace" }}>
          {t("settings.community.token.label")}: {token.slice(0, 8)}…
        </p>
      )}
      <button
        type="button"
        onClick={async () => {
          if (!confirm(t("settings.community.purge_confirm"))) return;
          await feedbackPurge();
          await refresh();
          refreshStats();
        }}
        style={{ ...btnStyle, marginTop: 6 }}
      >
        {t("settings.community.purge")}
      </button>
    </section>
  );
}
