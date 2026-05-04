export type Importance = "low" | "normal" | "high" | "critical";

export interface PickerRegion {
  id: string;
  // Native monitor pixels.
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  importance: Importance;
  label?: string;
}

export interface PickerSubmission {
  prompt: string;
  /// Base64 PNG (no `data:` prefix) of the annotated screenshot, cropped to
  /// the union of all regions with a small padding. Always present when
  /// `regions` is non-empty.
  imageBase64: string;
  regions: PickerRegion[];
  /// Bounding box of the cropped composite, in native monitor pixels.
  unionBox: { x: number; y: number; width: number; height: number };
  monitor: number;
}

export interface OverlayRegion extends PickerRegion {
  // Overlay-local pixels (relative to the picker container).
  ox: number;
  oy: number;
  ow: number;
  oh: number;
}

export const COLORS = [
  { name: "lime", value: "#7ee07a" },
  { name: "cyan", value: "#5fd0ff" },
  { name: "amber", value: "#ffb86b" },
  { name: "rose", value: "#ff7a8a" },
  { name: "violet", value: "#b58cff" },
  { name: "yellow", value: "#ffe066" },
];

export const IMPORTANCE_META: Record<
  Importance,
  { label: string; tag: string; color: string }
> = {
  low: { label: "Low", tag: "▪", color: "#7e8aa6" },
  normal: { label: "Normal", tag: "●", color: "#9aa6c0" },
  high: { label: "High", tag: "▲", color: "#ffb86b" },
  critical: { label: "Critical", tag: "★", color: "#ff5d6c" },
};

export const PADDING = 12;
