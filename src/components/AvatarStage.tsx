import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import AnimatedPlaceholder from "./AnimatedPlaceholder";
import Live2DCanvas from "./Live2DCanvas";
import VrmCanvas from "./VrmCanvas";

export default function AvatarStage({
  modelUrl,
  zoom = 1,
  offsetX = 0,
  offsetY = 0,
  isRotateMode = false,
}: {
  modelUrl: string | null;
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
  isRotateMode?: boolean;
}) {
  const [size, setSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () =>
      setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const lastDragReactRef = useRef(0);

  const startDrag = (e: React.PointerEvent) => {
    // If in 3D rotation mode, disable window dragging so left-click rotates character
    if (isRotateMode) return;
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragStarted = false;
    const onMove = (ev: PointerEvent) => {
      if (dragStarted) return;
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      dragStarted = true;
      cleanup();
      void getCurrentWindow().startDragging();
      const now = performance.now();
      if (now - lastDragReactRef.current > 12_000) {
        lastDragReactRef.current = now;
        void invoke("react_event", { kind: "drag" }).catch(() => {});
      }
    };
    const onUp = () => cleanup();
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const MAX_AVATAR_HEIGHT = 600;
  const MAX_AVATAR_WIDTH = 400;
  const H = Math.min(MAX_AVATAR_HEIGHT, Math.max(260, size.h - 120));
  const W = Math.min(MAX_AVATAR_WIDTH, Math.max(220, Math.round(H * 0.7)));
  const isVrm = Boolean(
    modelUrl && (modelUrl.toLowerCase().endsWith(".vrm") || modelUrl.toLowerCase().includes(".vrm"))
  );

  return (
    <div
      className="avatar-stage-container interactive"
      onPointerDown={startDrag}
      style={{
        position: "absolute",
        left: "50%",
        bottom: 0,
        transform: "translateX(-50%)",
        width: W,
        height: H,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        cursor: isRotateMode ? "grab" : "grab",
      }}
    >
      {modelUrl ? (
        isVrm ? (
          <VrmCanvas
            modelUrl={modelUrl}
            width={W}
            height={H}
            zoom={zoom}
            offsetX={offsetX}
            offsetY={offsetY}
            isRotateMode={isRotateMode}
          />
        ) : (
          <Live2DCanvas
            modelUrl={modelUrl}
            width={W}
            height={H}
            zoom={zoom}
            offsetX={offsetX}
            offsetY={offsetY}
          />
        )
      ) : (
        <AnimatedPlaceholder />
      )}
    </div>
  );
}
