import { useLocale, t } from "../i18n";
import { STAGE_LABELS, type RelationshipState } from "../api";

export interface TopBarProps {
  mode: string;
  hasKey: boolean;
  listenEnabled: boolean;
  listenReady: boolean;
  listening: boolean;
  heard: boolean;
  onToggleListen: () => void;
  onToggleSettings: () => void;
  onToggleWizard: () => void;
  onReset: () => void;
  onQuit: () => void;
  autoWatch: boolean;
  autoWatchAvailable: boolean;
  onToggleAutoWatch: () => void;
  relationship: RelationshipState | null;
  showRelationshipBadge: boolean;
}

/**
 * Floating top-right control strip: mode badge, relationship badge,
 * listen toggle, auto-watch toggle, reset / downloads / settings / quit.
 *
 * `props.listenEnabled` is unused by the UI directly today — the actual
 * styling reads `props.listening` (true while the mic stream is live) —
 * but it's kept on the prop type so callers can still flow it through
 * for future "want vs is" indicators without API churn.
 */
export function TopBar(props: TopBarProps) {
  useLocale(); // re-render on language change
  void props.listenEnabled;
  const listenIcon = props.heard ? "👂•" : "👂";
  return (
    <div
      className="interactive"
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        display: "flex",
        gap: 6,
        alignItems: "center",
        fontSize: 11,
        color: "#fff",
      }}
    >
      <span
        style={{
          padding: "3px 8px",
          borderRadius: 8,
          background: "rgba(20,20,28,0.7)",
          opacity: 0.85,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
        title={props.hasKey ? t("topbar.key_saved") : t("topbar.no_key")}
      >
        {props.mode}
        {!props.hasKey && props.mode !== "local" && " ⚠"}
      </span>
      {props.showRelationshipBadge && props.relationship && (
        <RelationshipBadge state={props.relationship} />
      )}
      <button
        onClick={props.onToggleListen}
        disabled={!props.listenReady}
        style={iconBtnStyle(props.listening)}
        title={
          !props.listenReady
            ? t("topbar.listen.tip_setup")
            : props.listening
              ? t("topbar.listen.tip_listening")
              : t("topbar.listen.tip_idle")
        }
      >
        {listenIcon}
      </button>
      <button
        onClick={props.onToggleAutoWatch}
        disabled={!props.autoWatchAvailable}
        style={iconBtnStyle(props.autoWatch)}
        title={
          !props.autoWatchAvailable
            ? t("topbar.watch.tip_setup")
            : props.autoWatch
              ? t("topbar.watch.tip_on")
              : t("topbar.watch.tip_off")
        }
      >
        👁
      </button>
      <button onClick={props.onReset} style={iconBtn} title={t("topbar.reset")}>
        ↺
      </button>
      <button
        onClick={props.onToggleWizard}
        style={iconBtn}
        title={t("topbar.downloads")}
      >
        ⬇
      </button>
      <button
        onClick={props.onToggleSettings}
        style={iconBtn}
        title={t("topbar.settings")}
      >
        ⚙
      </button>
      <button onClick={props.onQuit} style={iconBtn} title={t("topbar.quit")}>
        ✕
      </button>
    </div>
  );
}

function RelationshipBadge({ state }: { state: RelationshipState }) {
  useLocale();
  const meta = STAGE_LABELS[state.stage];
  const stages = Object.keys(STAGE_LABELS) as (keyof typeof STAGE_LABELS)[];
  const idx = stages.indexOf(state.stage);
  const thresholds = [0, 50, 150, 300, 500, 750, 1000];
  const lo = thresholds[idx] ?? 0;
  const hi = thresholds[idx + 1] ?? state.score + 1;
  const pct = Math.max(0, Math.min(1, (state.score - lo) / (hi - lo))) * 100;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stageName = t(`stage.${state.stage}` as any);
  return (
    <span
      title={`${stageName} · ${t("rel.score", { score: state.score })} · ${t("rel.interactions", { count: state.total_interactions, streak: state.daily_streak })}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 8,
        background: "rgba(20,20,28,0.7)",
        fontSize: 11,
      }}
    >
      <span>{meta.emoji}</span>
      <span style={{ opacity: 0.95 }}>{stageName}</span>
      <span
        style={{
          width: 28,
          height: 4,
          borderRadius: 2,
          background: "rgba(255,255,255,0.18)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            background: "rgba(255,255,255,0.55)",
          }}
        />
      </span>
    </span>
  );
}

const iconBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(20,20,28,0.7)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

/** Same neutral icon button, with a subtle white border when "active". */
function iconBtnStyle(active: boolean): React.CSSProperties {
  return {
    ...iconBtn,
    border: active ? "1px solid rgba(255,255,255,0.55)" : iconBtn.border,
  };
}

export default TopBar;
