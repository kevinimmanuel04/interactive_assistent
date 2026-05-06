// Outer wrapper around every top-level settings section. Gives the
// panel a uniform card-grid look regardless of which section is being
// rendered, and isolates section internals so they can each evolve
// independently without breaking visual rhythm.
//
// Sections continue to render their own title bar inside (most use
// the legacy `<div style={{opacity:0.7,marginBottom:6}}>` pattern);
// the wrapper just provides the card frame.

import type { CSSProperties, ReactNode } from "react";
import { cardStyle } from "../styles";

interface Props {
  children: ReactNode;
  /// Optional style override merged onto `cardStyle`. Used by sections
  /// that need a tighter inset (e.g. when the section is itself short).
  style?: CSSProperties;
}

export default function SectionCard({ children, style }: Props) {
  return <div style={{ ...cardStyle, ...style }}>{children}</div>;
}
