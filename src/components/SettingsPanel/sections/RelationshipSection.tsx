// Relationship system: a soft "affinity score" the assistant tracks
// across interactions. Stages are derived server-side from the score; we
// just render the current stage emoji + label and let the user reset it.
// NSFW toggle is gated by stage — only visible after the relationship
// has reached the romantic / lover stages.

import { useEffect, useState } from "react";
import {
  getRelationshipState,
  resetRelationship,
  setRelationshipDecayEnabled,
  setRelationshipNsfwAllowed,
  setRelationshipVisibility,
  setUserName,
  STAGE_LABELS,
  type PublicSettings,
  type RelationshipState,
} from "../../../api";
import { t, useLocale } from "../../../i18n";
import { toast } from "../../Toast";
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

export default function RelationshipSection({ settings, refresh }: Props) {
  useLocale();
  const [name, setName] = useState(settings?.user_name ?? "");
  const [state, setState] = useState<RelationshipState | null>(null);
  const visibility = settings?.relationship_visibility ?? "indicator";
  const nsfw = settings?.relationship_nsfw_allowed ?? false;
  const decay = settings?.relationship_decay_enabled ?? true;

  useEffect(() => {
    setName(settings?.user_name ?? "");
  }, [settings?.user_name]);

  useEffect(() => {
    let cancelled = false;
    void getRelationshipState()
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [settings]);

  const stageMeta = state ? STAGE_LABELS[state.stage] : null;

  return (
    <section style={sectionStyle}>
      <h3 style={h3Style}>💞 {t("rel.title")}</h3>
      <p style={hintStyle}>{t("rel.hint")}</p>
      {state && stageMeta && (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            margin: "8px 0",
          }}
        >
          <div style={{ fontSize: 22 }}>{stageMeta.emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {t(`stage.${state.stage}` as any)} ·{" "}
              {t("rel.score", { score: state.score })}
            </div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>
              {t("rel.interactions", {
                count: state.total_interactions,
                streak: state.daily_streak,
              })}
            </div>
          </div>
        </div>
      )}
      <label style={lblStyle}>{t("rel.your_name")}</label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          placeholder={t("rel.your_name.placeholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={async () => {
            try {
              await setUserName(name);
              await refresh();
              toast.success(t("settings.status.saved"));
            } catch (err) {
              toast.error(String(err));
            }
          }}
          style={btnStyle}
        >
          {t("common.save")}
        </button>
      </div>
      <label style={lblStyle}>{t("rel.visibility")}</label>
      <select
        value={visibility}
        onChange={async (e) => {
          await setRelationshipVisibility(
            e.target.value as "indicator" | "hidden",
          );
          await refresh();
        }}
        style={inputStyle}
      >
        <option value="indicator">{t("rel.visibility.show")}</option>
        <option value="hidden">{t("rel.visibility.hide")}</option>
      </select>
      <label
        style={{
          ...lblStyle,
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
        }}
      >
        <input
          type="checkbox"
          checked={decay}
          onChange={async (e) => {
            await setRelationshipDecayEnabled(e.target.checked);
            await refresh();
          }}
        />
        <span>{t("rel.decay")}</span>
      </label>
      {state && (state.stage === "romantic" || state.stage === "lover") && (
        <label
          style={{
            ...lblStyle,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            type="checkbox"
            checked={nsfw}
            onChange={async (e) => {
              await setRelationshipNsfwAllowed(e.target.checked);
              await refresh();
            }}
          />
          <span>{t("rel.nsfw")}</span>
        </label>
      )}
      {state && state.events.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary
            style={{ cursor: "pointer", fontSize: 11, opacity: 0.8 }}
          >
            {t("rel.recent_events")} ({state.events.length})
          </summary>
          <ul
            style={{
              maxHeight: 180,
              overflow: "auto",
              fontSize: 10,
              margin: "6px 0 0 0",
              padding: "0 0 0 16px",
              lineHeight: 1.5,
              opacity: 0.85,
            }}
          >
            {[...state.events]
              .reverse()
              .slice(0, 30)
              .map((ev, i) => (
                <li key={i}>
                  <span style={{ opacity: 0.8 }}>
                    {ev.delta >= 0 ? "+" : ""}
                    {ev.delta}
                  </span>{" "}
                  {ev.kind} — {ev.note}
                </li>
              ))}
          </ul>
        </details>
      )}
      <button
        onClick={async () => {
          if (!confirm(t("rel.reset.confirm"))) return;
          await resetRelationship();
          await refresh();
        }}
        style={{ ...btnStyle, marginTop: 8 }}
      >
        {t("rel.reset.button")}
      </button>
    </section>
  );
}
