import { useEffect, useState } from "react";
import { t } from "../i18n";
import {
  getRelationshipState,
  onRelationshipStageChange,
  onRelationshipUpdated,
  STAGE_LABELS,
  type RelationshipState,
} from "../api";

/**
 * Loads the initial relationship state, mirrors live updates from the
 * backend, and surfaces a stage-change toast in the chat bubble.
 *
 * Returns the current relationship object (or `null` until the first
 * fetch resolves) — pass it on to `<TopBar relationship={...} />`.
 */
export function useRelationship(opts: {
  setBubbleText: (text: string | null) => void;
  scheduleBubbleHide: (ms?: number) => void;
}): RelationshipState | null {
  const { setBubbleText, scheduleBubbleHide } = opts;
  const [relationship, setRelationship] = useState<RelationshipState | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void getRelationshipState()
      .then((s) => {
        if (!cancelled) setRelationship(s);
      })
      .catch(() => {});
    const updP = onRelationshipUpdated((s) => setRelationship(s));
    const stageP = onRelationshipStageChange((e) => {
      const next = STAGE_LABELS[e.current];
      const up =
        Object.keys(STAGE_LABELS).indexOf(e.current) >
        Object.keys(STAGE_LABELS).indexOf(e.previous);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stageName = (s: typeof e.current) => t(`stage.${s}` as any);
      const msg = up
        ? `${next.emoji} ${t("rel.stage_up")}: ${stageName(e.previous)} → ${stageName(e.current)}`
        : `${next.emoji} ${stageName(e.previous)} → ${stageName(e.current)}`;
      setBubbleText(msg);
      scheduleBubbleHide(6000);
    });
    return () => {
      cancelled = true;
      updP.then((fn) => fn());
      stageP.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return relationship;
}
