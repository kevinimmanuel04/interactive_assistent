import { useEffect, useRef, useState } from "react";
import { lipSync } from "../lipsync";

/**
 * Loads `live2dcubismcore.min.js` once from `/live2dcubismcore.min.js`
 * (served out of `public/`). Resolves with `true` on success, `false` on
 * 404 or load error. Further calls return the cached result.
 */
let cubismCorePromise: Promise<boolean> | null = null;
function ensureCubismCore(): Promise<boolean> {
  if (cubismCorePromise) return cubismCorePromise;
  cubismCorePromise = new Promise((resolve) => {
    if (
      (window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore
    ) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "/live2dcubismcore.min.js";
    script.async = true;
    script.onload = () =>
      resolve(
        !!(window as unknown as { Live2DCubismCore?: unknown })
          .Live2DCubismCore
      );
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return cubismCorePromise;
}

/**
 * Mounts a PIXI canvas and loads a Live2D Cubism 3/4 model from `modelUrl`.
 *
 * Graceful failure modes:
 *  - `/live2dcubismcore.min.js` missing → returns `null` (parent shows placeholder).
 *  - Model fetch/parse error → returns `null` + console warning.
 *  - PIXI/pixi-live2d-display import error → returns `null`.
 */
export default function Live2DCanvas({
  modelUrl,
  width,
  height,
}: {
  modelUrl: string;
  width: number;
  height: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const coreReady = await ensureCubismCore();
      if (!coreReady) {
        if (!disposed) setFailed(true);
        return;
      }

      try {
        const PIXI = await import("pixi.js");
        const { Live2DModel } = await import(
          "pixi-live2d-display-lipsyncpatch"
        );

        Live2DModel.registerTicker(PIXI.Ticker);

        if (disposed || !containerRef.current) return;

        const app = new PIXI.Application({
          width,
          height,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
        });
        containerRef.current.appendChild(app.view as unknown as Node);

        const model = await Live2DModel.from(modelUrl, {
          autoInteract: false,
        });
        if (disposed) {
          app.destroy(true, { children: true, texture: true, baseTexture: true });
          return;
        }

        const scale = Math.min(width / model.width, height / model.height) * 0.95;
        model.scale.set(scale);
        model.x = width / 2 - (model.width * scale) / 2;
        model.y = height - model.height * scale;

        app.stage.addChild(model as unknown as (typeof PIXI)["DisplayObject"]["prototype"]);

        // Lip-sync: feed AnalyserNode RMS into ParamMouthOpenY every frame.
        // We keep the latest level in a closure variable and apply it after
        // Live2D's motion update (via the PIXI ticker, which runs Live2DModel
        // update first because of registerTicker above).
        let mouth = 0;
        const unsubscribe = lipSync.subscribe((level) => {
          mouth = level;
        });
        const coreModel = (model as unknown as {
          internalModel?: {
            coreModel?: {
              setParameterValueById?: (id: string, value: number) => void;
            };
          };
        }).internalModel?.coreModel;
        const applyMouth = () => {
          if (coreModel?.setParameterValueById) {
            try {
              coreModel.setParameterValueById("ParamMouthOpenY", mouth);
            } catch {
              /* model may not have this parameter */
            }
          }
        };
        app.ticker.add(applyMouth);

        cleanup = () => {
          unsubscribe();
          try {
            app.ticker.remove(applyMouth);
          } catch {
            /* ignore */
          }
          try {
            model.destroy({ children: true, texture: true, baseTexture: true });
          } catch {
            /* ignore */
          }
          app.destroy(true, { children: true, texture: true, baseTexture: true });
        };
      } catch (err) {
        console.warn("[Live2D] failed to initialize:", err);
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      if (cleanup) cleanup();
    };
  }, [modelUrl, width, height]);

  if (failed) return null;

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        pointerEvents: "none",
      }}
    />
  );
}
