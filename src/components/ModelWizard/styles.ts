import type { CSSProperties } from "react";

/** Neutral pill button used across the wizard. `variant` is retained
 *  for call-site compat but renders identically — UI stays monochrome. */
export function btn(
  variant: "default" | "danger" = "default",
): CSSProperties {
  void variant;
  return {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(20,20,28,0.7)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 12,
  };
}

/** Small file-size formatter for download progress strings. */
export function formatMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  if (mb < 100) return `${mb.toFixed(1)} MB`;
  return `${mb.toFixed(0)} MB`;
}

export const card: CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
};

export const lbl: CSSProperties = {
  fontSize: 11,
  opacity: 0.7,
  marginTop: 6,
  marginBottom: 2,
  display: "block",
};

export const inp: CSSProperties = {
  width: "100%",
  background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  color: "#fff",
  padding: "5px 8px",
  fontSize: 12,
  boxSizing: "border-box",
};

export interface ProgressState {
  fileName: string;
  downloaded: number;
  total: number | null;
  state: "downloading" | "verifying" | "finished" | "failed";
  message?: string;
}
