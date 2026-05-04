import type { CSSProperties } from "react";

export const labelStyle: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  opacity: 0.6,
  marginBottom: 6,
};

export const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.25)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  outline: "none",
  fontSize: 14,
};

export function btnStyle(primary = false): CSSProperties {
  return {
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: primary ? "#6fae5a" : "rgba(255,255,255,0.12)",
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
  };
}

/// Clamp a pixel size to [64, 2048] then snap to the nearest multiple of 8
/// (Stable Diffusion / SDXL tile alignment).
export function clampMul8(n: number): number {
  const v = Math.max(64, Math.min(2048, Math.round(n)));
  return Math.max(64, Math.round(v / 8) * 8);
}
