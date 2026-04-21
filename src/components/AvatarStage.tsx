import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Placeholder avatar stage. In Phase 2 this will mount a PIXI canvas with
 * a Live2D model. For MVP we render a static anime-girl silhouette that
 * doubles as the drag handle for the window.
 */
export default function AvatarStage() {
  const startDrag = async (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    await getCurrentWindow().startDragging();
  };

  return (
    <div
      className="interactive"
      onPointerDown={startDrag}
      style={{
        position: "absolute",
        left: "50%",
        bottom: 0,
        transform: "translateX(-50%)",
        width: 320,
        height: 480,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        cursor: "grab",
      }}
    >
      {/* Placeholder silhouette — replaced by Live2D canvas later. */}
      <svg
        viewBox="0 0 160 240"
        width="100%"
        height="100%"
        style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.35))" }}
      >
        <defs>
          <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffd8ec" />
            <stop offset="100%" stopColor="#b39ddb" />
          </linearGradient>
        </defs>
        <circle cx="80" cy="60" r="36" fill="url(#g)" />
        <path
          d="M40 220 Q80 120 120 220 Z"
          fill="url(#g)"
          opacity="0.9"
        />
      </svg>
    </div>
  );
}
