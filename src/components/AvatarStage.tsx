import { getCurrentWindow } from "@tauri-apps/api/window";
import AnimatedPlaceholder from "./AnimatedPlaceholder";
import Live2DCanvas from "./Live2DCanvas";

/**
 * Avatar stage: renders the Live2D canvas when a model URL is configured
 * (and the Cubism runtime is available), otherwise shows an animated SVG
 * placeholder. Doubles as the window drag handle.
 */
export default function AvatarStage({ modelUrl }: { modelUrl: string | null }) {
  const startDrag = async (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    await getCurrentWindow().startDragging();
  };

  const W = 320;
  const H = 480;

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
        <>
          <Live2DCanvas modelUrl={modelUrl} width={W} height={H} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: -1,
              opacity: 0.6,
            }}
          >
            <AnimatedPlaceholder />
          </div>
        </>
      ) : (
        <AnimatedPlaceholder />
      )}
    </div>
  );
}
