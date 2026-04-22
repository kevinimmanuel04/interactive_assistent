import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AnimatedPlaceholder from "./AnimatedPlaceholder";
import Live2DCanvas from "./Live2DCanvas";

/**
 * Avatar stage: renders the Live2D canvas when a model URL is configured
 * (and the Cubism runtime is available), otherwise shows an animated SVG
 * placeholder. Doubles as the window drag handle.
 *
 * Tracks window size so the avatar scales responsively when the user
 * resizes the Komorebi window.
 */
export default function AvatarStage({ modelUrl }: { modelUrl: string | null }) {
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

  const startDrag = async (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    await getCurrentWindow().startDragging();
  };

  // Leave ~100 px of headroom for the chat bubble and top bar.
  const H = Math.max(260, size.h - 120);
  const W = Math.max(220, Math.min(size.w - 24, Math.round(H * 0.7)));

  return (
    <div
      className="interactive"
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
        cursor: "grab",
      }}
    >
      {modelUrl ? (
        <Live2DCanvas modelUrl={modelUrl} width={W} height={H} />
      ) : (
        <AnimatedPlaceholder />
      )}
    </div>
  );
}
