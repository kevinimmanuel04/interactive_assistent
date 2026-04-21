import { useEffect, useRef, useState } from "react";
import { avatarState, AvatarState } from "../avatarState";
import { Emotion } from "../emotion";
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

        // Idle body sway: gentle sinusoidal drift on head/body params.
        // Keeps the character visibly alive when no motion is playing.
        const bornAt = performance.now();

        const applyMouth = () => {
          const t = (performance.now() - bornAt) / 1000;
          if (coreModel?.setParameterValueById) {
            try {
              coreModel.setParameterValueById("ParamMouthOpenY", mouth);
            } catch {
              /* model may not have this parameter */
            }
            // Best-effort idle sway — all parameters are optional; each is
            // wrapped in its own try/catch because some models lack them.
            trySet(coreModel, "ParamAngleX", Math.sin(t * 0.6) * 6);
            trySet(coreModel, "ParamAngleY", Math.sin(t * 0.4) * 3);
            trySet(coreModel, "ParamBodyAngleX", Math.sin(t * 0.3) * 3);
            trySet(coreModel, "ParamBreath", 0.5 + Math.sin(t * 1.2) * 0.5);
          }
        };
        app.ticker.add(applyMouth);

        // Drive Live2D expressions and occasional motions from avatar state.
        // Expression and motion names are best-effort; we silently ignore
        // models that don't define them.
        let lastEmotion: Emotion = "neutral";
        let lastMode: AvatarState["mode"] = "idle";
        const unsubState = avatarState.subscribe((s) => {
          if (s.emotion !== lastEmotion) {
            lastEmotion = s.emotion;
            tryExpression(model, EXPRESSION_MAP[s.emotion]);
          }
          if (s.mode !== lastMode) {
            lastMode = s.mode;
            const motion = MOTION_MAP[s.mode];
            if (motion) tryMotion(model, motion);
          }
        });

        cleanup = () => {
          unsubscribe();
          unsubState();
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

// --- Live2D helpers --------------------------------------------------------

/**
 * Conventional expression file names. If the loaded model exposes one of
 * these in its `.model3.json` expressions list, it will be activated when
 * the corresponding emotion becomes dominant. Any miss is silent.
 */
const EXPRESSION_MAP: Record<Emotion, string> = {
  neutral: "neutral",
  happy: "happy",
  sad: "sad",
  angry: "angry",
  surprised: "surprised",
  thinking: "thinking",
};

/**
 * Motion group hints played on mode changes. Names follow the usual
 * Cubism convention (`Idle`, `TapBody`, etc.); again, misses are silent.
 */
const MOTION_MAP: Record<AvatarState["mode"], string | null> = {
  idle: "Idle",
  listening: null, // let the last motion continue
  thinking: "Thinking",
  speaking: "Speaking",
};

interface ExpressiveModel {
  expression?: (name: string) => unknown;
  motion?: (group: string, index?: number, priority?: number) => unknown;
}

function tryExpression(model: unknown, name: string) {
  const m = model as ExpressiveModel;
  if (typeof m.expression !== "function") return;
  try {
    m.expression(name);
  } catch {
    /* model doesn't define this expression — ignore */
  }
}

function tryMotion(model: unknown, group: string) {
  const m = model as ExpressiveModel;
  if (typeof m.motion !== "function") return;
  try {
    // Priority 2 = NORMAL in pixi-live2d-display; lets idle interrupt nothing
    // but intentional mode motions interrupt idle.
    m.motion(group, undefined, 2);
  } catch {
    /* no such motion group — ignore */
  }
}

function trySet(
  coreModel: { setParameterValueById?: (id: string, value: number) => void },
  id: string,
  value: number,
) {
  try {
    coreModel.setParameterValueById?.(id, value);
  } catch {
    /* parameter missing on this model */
  }
}
