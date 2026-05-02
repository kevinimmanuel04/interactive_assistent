import { useEffect, useRef, useState } from "react";
import { desktopListScreens, desktopScreenshot, ScreenInfo } from "../api";

interface Props {
  open: boolean;
  onCancel: () => void;
  /// Returns native-monitor coordinates ready to send to the backend.
  onSelect: (region: {
    monitor: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
}

/// Fullscreen overlay that shows a still screenshot of the primary monitor
/// and lets the user drag a rectangle to crop it. Coordinates are mapped
/// back to native monitor pixels before being handed to the backend.
export default function RegionPicker({ open, onCancel, onSelect }: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    sx: number;
    sy: number;
    ex: number;
    ey: number;
    active: boolean;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let revoked: string | null = null;
    setImgUrl(null);
    setError(null);
    setDrag(null);
    (async () => {
      try {
        const screens = await desktopListScreens();
        const primary = screens.find((s) => s.is_primary) ?? screens[0];
        setScreen(primary ?? null);
        const bytes = await desktopScreenshot(0);
        const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
        const url = URL.createObjectURL(blob);
        revoked = url;
        setImgUrl(url);
      } catch (e) {
        setError(String(e));
      }
    })();
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const onDown = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrag({ sx: x, sy: y, ex: x, ey: y, active: true });
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drag?.active) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDrag({
      ...drag,
      ex: e.clientX - rect.left,
      ey: e.clientY - rect.top,
    });
  };
  const onUp = () => {
    if (!drag?.active) return;
    setDrag({ ...drag, active: false });
  };

  const confirm = () => {
    if (!drag || !screen || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(drag.sx, drag.ex));
    const y = Math.max(0, Math.min(drag.sy, drag.ey));
    const w = Math.abs(drag.ex - drag.sx);
    const h = Math.abs(drag.ey - drag.sy);
    if (w < 8 || h < 8) return;
    // Map overlay-pixels → native monitor pixels.
    const sx = screen.width / rect.width;
    const sy = screen.height / rect.height;
    onSelect({
      monitor: 0,
      x: Math.round(x * sx),
      y: Math.round(y * sy),
      width: Math.max(1, Math.round(w * sx)),
      height: Math.max(1, Math.round(h * sy)),
    });
  };

  const rectStyle: React.CSSProperties | null = drag
    ? {
        position: "absolute",
        left: Math.min(drag.sx, drag.ex),
        top: Math.min(drag.sy, drag.ey),
        width: Math.abs(drag.ex - drag.sx),
        height: Math.abs(drag.ey - drag.sy),
        border: "2px solid #6fae5a",
        background: "rgba(111,174,90,0.18)",
        pointerEvents: "none",
      }
    : null;

  return (
    <div
      className="interactive"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(2px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
      }}
    >
      <div
        style={{
          color: "#fff",
          fontSize: 13,
          marginBottom: 6,
          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
        }}
      >
        Drag to select a region · Esc to cancel
      </div>
      <div
        ref={containerRef}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        style={{
          position: "relative",
          width: "92vw",
          height: "82vh",
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: 8,
          overflow: "hidden",
          cursor: "crosshair",
          background: "#111",
        }}
      >
        {error && (
          <div style={{ color: "#ff8888", padding: 12 }}>{error}</div>
        )}
        {imgUrl && (
          <img
            src={imgUrl}
            alt="screen"
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              pointerEvents: "none",
            }}
          />
        )}
        {rectStyle && <div style={rectStyle} />}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={onCancel} style={btnStyle()}>
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={!drag || drag.active}
          style={btnStyle(true)}
        >
          Use selection
        </button>
      </div>
    </div>
  );
}

function btnStyle(primary = false): React.CSSProperties {
  return {
    padding: "6px 14px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: primary ? "#6fae5a" : "rgba(255,255,255,0.12)",
    color: "#fff",
    fontSize: 12,
  };
}
