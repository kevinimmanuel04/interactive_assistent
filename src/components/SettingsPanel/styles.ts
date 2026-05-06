// Shared inline styles for the settings panel.
//
// The panel uses inline styles (rather than CSS modules) for parity with
// the rest of the chat overlay, which lives in a portal and historically
// avoided a global stylesheet to keep the bundle small.
//
// Two near-identical input styles existed in the legacy monolith
// (`inputStyle` and `inpStyle`). They have been consolidated into a single
// canonical `inputStyle` used by every section.

import type { CSSProperties } from "react";

export const sectionStyle: CSSProperties = {
  marginTop: 14,
  paddingTop: 12,
  borderTop: "1px solid rgba(255,255,255,0.08)",
};

export const h3Style: CSSProperties = {
  fontSize: 13,
  margin: "0 0 8px 0",
  letterSpacing: 0.4,
  textTransform: "uppercase",
  opacity: 0.85,
};

export const lblStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  opacity: 0.7,
  marginTop: 6,
  marginBottom: 2,
};

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(0,0,0,0.25)",
  color: "#fff",
  outline: "none",
  fontSize: 12,
  boxSizing: "border-box",
};

export const btnStyle: CSSProperties = {
  padding: "5px 12px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(20,20,28,0.7)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 12,
};

export const hintStyle: CSSProperties = {
  fontSize: 10,
  opacity: 0.55,
  margin: "4px 0 0 0",
  lineHeight: 1.4,
};

// Background "card" style used by sub-sections nested inside other
// sections (e.g. Prosody inside Tts, OpenRouter inside Stt).
export const subCardStyle: CSSProperties = {
  marginTop: 10,
  padding: 8,
  background: "rgba(255,255,255,0.03)",
  borderRadius: 6,
};

/// Outer card around each top-level section. Replaces the previous
/// pattern where every section painted its own title strip with
/// inline {opacity:0.7,marginBottom:6} — the panel now looks
/// uniform regardless of which section is rendered.
export const cardStyle: CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.025)",
  border: "1px solid rgba(255,255,255,0.06)",
};

/// Canonical title used inside cards. Same visual weight as the
/// inline `<div style={{opacity:0.7,marginBottom:6}}>` that 9+
/// sections shipped before unification — sections still using the
/// inline form continue to look correct, but new code should use this.
export const cardTitleStyle: CSSProperties = {
  opacity: 0.85,
  marginBottom: 8,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 0.3,
  textTransform: "uppercase",
};
