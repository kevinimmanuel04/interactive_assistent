import { useEffect, type MutableRefObject } from "react";
import { listen } from "@tauri-apps/api/event";

/**
 * Surfaces proactive-suggestion and game-coach tips as a transient bubble.
 * Skipped while a real reply is currently streaming so we don't stomp on
 * the active conversation.
 */
export function useTransientBubbles(opts: {
  activeIdRef: MutableRefObject<string | null>;
  setBubbleText: (text: string | null) => void;
  bubbleTimer: MutableRefObject<number | null>;
}): void {
  const { activeIdRef, setBubbleText, bubbleTimer } = opts;

  useEffect(() => {
    const showTransient = (text: string) => {
      if (activeIdRef.current) return;
      setBubbleText(text);
      if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
      bubbleTimer.current = window.setTimeout(() => {
        setBubbleText(null);
        bubbleTimer.current = null;
      }, 8000);
    };
    const p1 = listen<{ hint: string }>("proactive:suggest", (evt) => {
      const hint = evt.payload?.hint?.trim();
      if (hint) showTransient(hint);
    });
    const p2 = listen<{ game: string; hint: string }>("coach:tip", (evt) => {
      const hint = evt.payload?.hint?.trim();
      if (hint) showTransient(hint);
    });
    return () => {
      p1.then((fn) => fn());
      p2.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
