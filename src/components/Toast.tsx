// Lightweight global toast bus — no external dep.
//
// Anywhere in the app: `toast.success("Saved")`, `toast.error(err)`,
// `toast.info("...")`. Mount `<ToastHost />` once near the root.

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  /** ms; defaults: success 1800, info 2200, error 4000 */
  duration?: number;
}

type Listener = (t: Toast) => void;
const listeners = new Set<Listener>();
let nextId = 1;

function emit(kind: ToastKind, text: string, duration?: number) {
  const t: Toast = { id: nextId++, kind, text, duration };
  listeners.forEach((l) => l(t));
}

export const toast = {
  success: (text: string, duration?: number) => emit("success", text, duration),
  error: (text: string, duration?: number) => emit("error", text, duration),
  info: (text: string, duration?: number) => emit("info", text, duration),
};

const PALETTE: Record<
  ToastKind,
  { bg: string; border: string; fg: string; icon: string }
> = {
  success: {
    bg: "rgba(31, 64, 41, 0.96)",
    border: "rgba(132, 196, 152, 0.45)",
    fg: "#dcefe1",
    icon: "✓",
  },
  error: {
    bg: "rgba(74, 30, 36, 0.96)",
    border: "rgba(220, 120, 130, 0.45)",
    fg: "#fbe1e4",
    icon: "!",
  },
  info: {
    bg: "rgba(28, 39, 64, 0.96)",
    border: "rgba(140, 170, 220, 0.45)",
    fg: "#e1ebfb",
    icon: "i",
  },
};

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const onPush: Listener = (t) => {
      setItems((prev) => [...prev, t]);
      const ttl =
        t.duration ?? (t.kind === "error" ? 4000 : t.kind === "info" ? 2200 : 1800);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, ttl);
    };
    listeners.add(onPush);
    return () => {
      listeners.delete(onPush);
    };
  }, []);

  return (
    <div
      className="interactive"
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 9999,
        pointerEvents: "none",
        maxWidth: "calc(100vw - 24px)",
      }}
    >
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const p = PALETTE[t.kind];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ duration: 0.16 }}
              style={{
                background: p.bg,
                border: `1px solid ${p.border}`,
                color: p.fg,
                padding: "8px 12px",
                borderRadius: 10,
                fontSize: 12.5,
                lineHeight: 1.35,
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                pointerEvents: "auto",
                maxWidth: 360,
                wordBreak: "break-word",
              }}
              role={t.kind === "error" ? "alert" : "status"}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.12)",
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                {p.icon}
              </span>
              <span>{t.text}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
