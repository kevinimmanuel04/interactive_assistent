import type { ScreenInfo } from "../../api";
import { IMPORTANCE_META, PADDING, type PickerRegion } from "./types";

export interface ComposeResult {
  blob: Blob;
  base64: string;
  unionBox: { x: number; y: number; width: number; height: number };
}

/// Render the screenshot annotated with every region rectangle and tag,
/// cropped to the union bbox + padding. Returns blob + base64 + bbox, or
/// `null` if there is no image / no regions / no canvas context.
export async function composeAnnotated(
  imgBitmap: HTMLImageElement | null,
  screen: ScreenInfo | null,
  regions: PickerRegion[],
): Promise<ComposeResult | null> {
  if (!imgBitmap || !screen || regions.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const r of regions) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.width > maxX) maxX = r.x + r.width;
    if (r.y + r.height > maxY) maxY = r.y + r.height;
  }
  const pad = PADDING * 2;
  const ux = Math.max(0, Math.floor(minX - pad));
  const uy = Math.max(0, Math.floor(minY - pad));
  const uw = Math.min(screen.width - ux, Math.ceil(maxX - minX + pad * 2));
  const uh = Math.min(screen.height - uy, Math.ceil(maxY - minY + pad * 2));
  const canvas = document.createElement("canvas");
  canvas.width = uw;
  canvas.height = uh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(imgBitmap, ux, uy, uw, uh, 0, 0, uw, uh);
  const lineWidth = Math.max(2, Math.round(Math.min(uw, uh) / 360));
  ctx.lineJoin = "round";
  regions.forEach((r, idx) => {
    const x = r.x - ux;
    const y = r.y - uy;
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = r.color;
    ctx.fillStyle = r.color + "22";
    ctx.fillRect(x, y, r.width, r.height);
    ctx.strokeRect(x + 0.5, y + 0.5, r.width - 1, r.height - 1);
    const meta = IMPORTANCE_META[r.importance];
    const tagText = `#${idx + 1} ${meta.tag} ${meta.label}${
      r.label ? ` — ${r.label}` : ""
    }`;
    const fontSize = Math.max(14, Math.round(lineWidth * 6));
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    const textW = ctx.measureText(tagText).width;
    const padBox = lineWidth * 2;
    const boxH = fontSize + padBox * 2;
    const boxY = y - boxH > 0 ? y - boxH : y;
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(x, boxY, textW + padBox * 3, boxH);
    ctx.fillStyle = r.color;
    ctx.fillRect(x, boxY, lineWidth * 2, boxH);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.fillText(tagText, x + padBox * 2, boxY + padBox);
  });
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b ?? new Blob()), "image/png"),
  );
  const base64: string = await new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = fr.result as string;
      resolve(s.split(",")[1] ?? "");
    };
    fr.readAsDataURL(blob);
  });
  return {
    blob,
    base64,
    unionBox: { x: ux, y: uy, width: uw, height: uh },
  };
}
