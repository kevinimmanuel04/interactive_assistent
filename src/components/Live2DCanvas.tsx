import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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

        // Parameter naming differs between Cubism 2 and Cubism 4 models:
        //   Cubism 4 → "ParamMouthOpenY", "ParamAngleX", …
        //   Cubism 2 → "PARAM_MOUTH_OPEN_Y", "PARAM_ANGLE_X", …
        // We try the runtime-specific name first and fall back to the other
        // naming convention transparently, so one code path drives both.
        const P = runtime === "cubism4"
          ? {
              mouth: "ParamMouthOpenY",
              angleX: "ParamAngleX",
              angleY: "ParamAngleY",
              bodyX: "ParamBodyAngleX",
              breath: "ParamBreath",
              eyeLOpen: "ParamEyeLOpen",
              eyeROpen: "ParamEyeROpen",
              eyeBallX: "ParamEyeBallX",
              eyeBallY: "ParamEyeBallY",
            }
          : {
              mouth: "PARAM_MOUTH_OPEN_Y",
              angleX: "PARAM_ANGLE_X",
              angleY: "PARAM_ANGLE_Y",
              bodyX: "PARAM_BODY_ANGLE_X",
              breath: "PARAM_BREATH",
              eyeLOpen: "PARAM_EYE_L_OPEN",
              eyeROpen: "PARAM_EYE_R_OPEN",
              eyeBallX: "PARAM_EYE_BALL_X",
              eyeBallY: "PARAM_EYE_BALL_Y",
            };

        // Idle body sway: gentle sinusoidal drift on head/body params.
        // Keeps the character visibly alive when no motion is playing.
        const bornAt = performance.now();

        // Track mouse for natural eye-tracking (within canvas bounds).
        let eyeX = 0;
        let eyeY = 0;
        const container = containerRef.current;
        const onMove = (e: PointerEvent) => {
          if (!container) return;
          const r = container.getBoundingClientRect();
          eyeX = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
          eyeY = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
        };
        window.addEventListener("pointermove", onMove);

        // Blink on a stochastic schedule, like a human.
        let nextBlinkAt = performance.now() + 2000 + Math.random() * 3000;
        let blinkStart = 0;
        const BLINK_MS = 140;

        const applyMouth = () => {
          const now = performance.now();
          const t = (now - bornAt) / 1000;
          if (!coreModel?.setParameterValueById) return;
          // Mouth from envelope; exaggerate a bit so small RMS still visible.
          trySet(coreModel, P.mouth, Math.min(1, mouth * 1.2));
          // Idle sway.
          trySet(coreModel, P.angleX, Math.sin(t * 0.6) * 10 + eyeX * 12);
          trySet(coreModel, P.angleY, Math.sin(t * 0.4) * 5 + eyeY * -8);
          trySet(coreModel, P.bodyX, Math.sin(t * 0.3) * 3);
          trySet(coreModel, P.breath, 0.5 + Math.sin(t * 1.2) * 0.5);
          trySet(coreModel, P.eyeBallX, eyeX);
          trySet(coreModel, P.eyeBallY, -eyeY);
          // Blink.
          if (blinkStart === 0 && now >= nextBlinkAt) {
            blinkStart = now;
          }
          if (blinkStart > 0) {
            const dt = now - blinkStart;
            if (dt < BLINK_MS) {
              // Simple triangular envelope: closed at the midpoint.
              const k = 1 - Math.abs(dt - BLINK_MS / 2) / (BLINK_MS / 2);
              const open = 1 - k;
              trySet(coreModel, P.eyeLOpen, open);
              trySet(coreModel, P.eyeROpen, open);
            } else {
              blinkStart = 0;
              nextBlinkAt = now + 2500 + Math.random() * 4000;
              trySet(coreModel, P.eyeLOpen, 1);
              trySet(coreModel, P.eyeROpen, 1);
            }
          }
        };
        app.ticker.add(applyMouth);

        // Drive Live2D expressions and occasional motions from avatar state.
        // For Cubism 2 models expressions usually don't exist, so we also
        // map emotions to motion groups as a fallback.
        let lastEmotion: Emotion = "neutral";
        let lastMode: AvatarState["mode"] = "idle";
        const unsubState = avatarState.subscribe((s) => {
          if (s.emotion !== lastEmotion) {
            lastEmotion = s.emotion;
            tryExpression(model, EXPRESSION_MAP[s.emotion]);
            const emotionMotion = EMOTION_MOTION_MAP[s.emotion];
            if (emotionMotion) tryMotionAny(model, emotionMotion);
          }
          if (s.mode !== lastMode) {
            lastMode = s.mode;
            const motion = MOTION_MAP[s.mode];
            if (motion) tryMotionAny(model, [motion]);
          }
        });

        // Click-to-interact: tap on the avatar → play a random body/head
        // motion AND have her say a random reaction line. We allow the
        // event to bubble so AvatarStage's window drag handler still fires
        // — if the user drags, AvatarStage will move the window; if they
        // just click (pointerup within a short distance), we treat it as
        // a tap and trigger the reaction.
        const canvas = app.view as HTMLCanvasElement;
        canvas.style.pointerEvents = "auto";
        canvas.style.cursor = "grab";
        let pressX = 0;
        let pressY = 0;
        let pressAt = 0;
        const onPointerDown = (e: PointerEvent) => {
          if (e.button !== 0) return;
          pressX = e.clientX;
          pressY = e.clientY;
          pressAt = performance.now();
        };
        const onPointerUp = (e: PointerEvent) => {
          if (e.button !== 0 || pressAt === 0) return;
          const dx = e.clientX - pressX;
          const dy = e.clientY - pressY;
          const dt = performance.now() - pressAt;
          pressAt = 0;
          // Drag threshold: if the pointer moved more than ~6 px or was
          // held longer than 350 ms, treat it as a drag (AvatarStage is
          // doing its thing) and don't fire a tap.
          if (Math.hypot(dx, dy) > 6 || dt > 350) return;
          const r = canvas.getBoundingClientRect();
          const ny = (e.clientY - r.top) / r.height;
          const zone = ny < 0.33 ? "head" : "body";
          const groups = zone === "head"
            ? ["tap_head", "TapHead", "tap_body", "TapBody"]
            : ["tap_body", "TapBody", "tap", "Tap"];
          tryMotionAny(model, groups);
          // Fire-and-forget reaction line through whichever TTS provider
          // is active. Silent when TTS is disabled.
          invoke("speak_reaction", { zone }).catch(() => {});
        };
        canvas.addEventListener("pointerdown", onPointerDown);
        canvas.addEventListener("pointerup", onPointerUp);

        cleanup = () => {
          unsubscribe();
          unsubState();
          window.removeEventListener("pointermove", onMove);
          try {
            canvas.removeEventListener("pointerdown", onPointerDown);
            canvas.removeEventListener("pointerup", onPointerUp);
          } catch {
            /* ignore */
          }
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
        // The canvas inside enables pointer-events itself so clicks on
        // the avatar are captured. Clicks on transparent areas bubble
        // up to AvatarStage for window dragging.
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

/**
 * Emotion → list of candidate motion group names. We try them in order
 * and play the first one the model actually defines. This lets Cubism 2
 * models (no expression files) still show emotion via motions.
 */
const EMOTION_MOTION_MAP: Record<Emotion, string[]> = {
  neutral: [],
  happy: ["Happy", "happy", "tap_body", "TapBody"],
  sad: ["Sad", "sad"],
  angry: ["Angry", "angry"],
  surprised: ["Surprised", "surprised", "tap_head", "TapHead"],
  thinking: ["Thinking", "thinking"],
};

interface ExpressiveModel {
  expression?: (name: string) => unknown;
  motion?: (group: string, index?: number, priority?: number) => unknown;
  internalModel?: {
    motionManager?: {
      definitions?: unknown;
      motionGroups?: unknown;
      settings?: unknown;
    };
  };
}

function tryMotionAny(model: unknown, groups: string[]) {
  for (const g of groups) {
    if (tryMotion(model, g)) return;
  }
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

function tryMotion(model: unknown, group: string): boolean {
  const m = model as ExpressiveModel;
  if (typeof m.motion !== "function") return false;
  try {
    // Priority 2 = NORMAL in pixi-live2d-display; lets idle interrupt nothing
    // but intentional mode motions interrupt idle.
    const result = m.motion(group, undefined, 2);
    // pixi-live2d-display returns a Promise<boolean> that resolves false
    // when the motion group is missing. We fire-and-forget but return
    // true for the sync path so the caller can at least try others on throw.
    if (result && typeof (result as Promise<unknown>).then === "function") {
      return true;
    }
    return !!result;
  } catch {
    /* no such motion group — ignore */
    return false;
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
