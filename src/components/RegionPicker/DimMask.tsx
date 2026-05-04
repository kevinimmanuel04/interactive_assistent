import type { OverlayRegion } from "./types";

/// Translucent dark overlay that "punches out" a hole over each region
/// rectangle plus the in-progress drag. Rendered as a single SVG so the
/// browser composites everything in one paint.
export function DimMask({
  regions,
  drawing,
}: {
  regions: OverlayRegion[];
  drawing: { x: number; y: number; w: number; h: number } | null;
}) {
  const id = "rp-mask";
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      <defs>
        <mask id={id}>
          {/* white = dim visible, black = cutout */}
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          {regions.map((r) => (
            <rect
              key={r.id}
              x={r.ox}
              y={r.oy}
              width={r.ow}
              height={r.oh}
              fill="black"
            />
          ))}
          {drawing && drawing.w > 0 && drawing.h > 0 && (
            <rect
              x={drawing.x}
              y={drawing.y}
              width={drawing.w}
              height={drawing.h}
              fill="black"
            />
          )}
        </mask>
      </defs>
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.55)"
        mask={`url(#${id})`}
      />
    </svg>
  );
}
