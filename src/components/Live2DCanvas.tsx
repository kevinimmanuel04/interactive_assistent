import { useEffect, useRef, useState } from "react";
import { avatarState, AvatarState } from "../avatarState";
import { Emotion } from "../emotion";
import { lipSync } from "../lipsync";

/**
 * Loads the right Live2D runtime for the given model URL:
 *   * `.model.json`   → Cubism 2 (`live2d.min.js`)
 *   * `.model3.json`  → Cubism 3/4 (`live2dcubismcore.min.js`)
 *
 * First tries the file served out of `public/`, then falls back to the
 * canonical CDN so out-of-the-box first-run with a remote model just works.
 * Resolves with `true` on success.
 */
type Runtime = "cubism2" | "cubism4";

function detectRuntime(modelUrl: string): Runtime {
  // Strip query / hash before extension check
  const clean = modelUrl.split(/[?#]/)[0].toLowerCase();
  return clean.endsWith(".model3.json") ? "cubism4" : "cubism2";
}

const runtimePromises: Partial<Record<Runtime, Promise<boolean>>> = {};

function loadScript(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

function ensureRuntime(runtime: Runtime): Promise<boolean> {
  const cached = runtimePromises[runtime];
  if (cached) return cached;

  const p = (async () => {
    const w = window as unknown as {
      Live2DCubismCore?: unknown;
      Live2D?: unknown;
    };
    if (runtime === "cubism4" && w.Live2DCubismCore) return true;
    if (runtime === "cubism2" && w.Live2D) return true;

    const sources =
      runtime === "cubism4"
        ? [
            "/live2dcubismcore.min.js",
            "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js",
          ]
        : [
            "/live2d.min.js",
            "https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js",
          ];

    for (const src of sources) {
      const ok = await loadScript(src);
      if (!ok) continue;
      const loaded =
        runtime === "cubism4"
          ? !!(window as unknown as { Live2DCubismCore?: unknown })
              .Live2DCubismCore
          : !!(window as unknown as { Live2D?: unknown }).Live2D;
      if (loaded) return true;
    }
    return false;
  })();

  runtimePromises[runtime] = p;
  return p;
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
      const runtime = detectRuntime(modelUrl);
      const coreReady = await ensureRuntime(runtime);
      if (!coreReady) {
        console.warn(
          `[Live2D] ${runtime} runtime failed to load (local /public and CDN both unreachable)`
        );
        if (!disposed) setFailed(true);
        return;
      }

      try {
        const PIXI = await import("pixi.js");
        // The default entry of pixi-live2d-display-lipsyncpatch is Cubism 4
        // only. Load the matching sub-bundle so each runtime actually finds
        // its core lib.
        const mod =
          runtime === "cubism4"
            ? await import("pixi-live2d-display-lipsyncpatch/cubism4")
            : await import("pixi-live2d-display-lipsyncpatch/cubism2");
        const { Live2DModel } = mod;

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

        // Anchor to model centre so scaling + positioning is predictable
        // across both Cubism 2 and Cubism 4 models (their internal origins
        // differ — Cubism 2 uses top-left, Cubism 4 often uses centre).
        let anchored = false;
        try {
          (model as unknown as { anchor: { set: (x: number, y: number) => void } })
            .anchor.set(0.5, 0.5);
          anchored = true;
        } catch {
          /* some builds expose anchor on the internal sprite only */
        }
        const scale = Math.min(width / model.width, height / model.height) * 0.9;
        model.scale.set(scale);
        if (anchored) {
          model.x = width / 2;
          model.y = height / 2;
        } else {
          model.x = width / 2 - (model.width * scale) / 2;
          model.y = height / 2 - (model.height * scale) / 2;
        }

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
