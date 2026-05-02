import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { avatarState, AvatarState } from "../avatarState";
import { Emotion } from "../emotion";
import { lipSync } from "../lipsync";

/**
 * Loads the right Live2D runtime for the given model URL:
 *   * `.model.json`   → Cubism 2 (`live2d.min.js`)
 *   * `.model3.json`  → Cubism 3 / 4 / 5 (`live2dcubismcore.min.js`)
 *
 * The Cubism Core for Web served at `cubism.live2d.com` is the latest SDK
 * release (currently 5.x), so `.moc3` files exported from Cubism 5 Editor
 * load through the same cubism4 entry of `pixi-live2d-display-lipsyncpatch`.
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
 * Mounts a PIXI canvas and loads a Live2D Cubism 3 / 4 / 5 model from `modelUrl`.
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
  zoom = 1,
  offsetX = 0,
  offsetY = 0,
}: {
  modelUrl: string;
  width: number;
  height: number;
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  // Live layout refs — let the user tweak avatar zoom/position without
  // tearing down the whole PIXI app + Live2D model.
  type ModelRef = {
    model: { scale: { set: (s: number) => void }; x: number; y: number; width: number; height: number };
    anchored: boolean;
    canvasW: number;
    canvasH: number;
  };
  const modelRef = useRef<ModelRef | null>(null);
  const zoomRef = useRef(zoom);
  const offsetXRef = useRef(offsetX);
  const offsetYRef = useRef(offsetY);

  // Re-apply scale + position from current refs. Re-used on first load and
  // whenever the user tweaks zoom/offset sliders in Settings.
  const applyLayout = () => {
    const ref = modelRef.current;
    if (!ref) return;
    const { model, anchored, canvasW, canvasH } = ref;
    const fit = Math.min(canvasW / model.width, canvasH / model.height) * 0.9;
    const scale = fit * Math.max(0.1, zoomRef.current);
    model.scale.set(scale);
    // Offsets are fractions of the canvas box: ±1.0 = ±half the box.
    const cx = canvasW / 2 + offsetXRef.current * (canvasW / 2);
    const cy = canvasH / 2 + offsetYRef.current * (canvasH / 2);
    if (anchored) {
      model.x = cx;
      model.y = cy;
    } else {
      model.x = cx - (model.width * scale) / 2;
      model.y = cy - (model.height * scale) / 2;
    }
  };

  // Push prop updates into refs and re-layout live.
  useEffect(() => {
    zoomRef.current = zoom;
    offsetXRef.current = offsetX;
    offsetYRef.current = offsetY;
    applyLayout();
    // applyLayout is stable (closes over refs only).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, offsetX, offsetY]);

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
        // pixi-live2d-display-lipsyncpatch internally calls
        // `PIXI.utils.url.resolve(...)`, which was deprecated in PixiJS
        // v7.3 and prints a console.warn on every access. PixiJS exposes
        // `utils.url` via a getter that triggers the warning, so we
        // can't assign to `utils.url.resolve` directly. Instead we
        // redefine `utils.url` itself with a plain object that does the
        // same job using the native URL API — the library still works,
        // and PixiJS never fires its deprecation logger.
        try {
          const utils = (PIXI as unknown as { utils?: Record<string, unknown> }).utils;
          if (utils) {
            Object.defineProperty(utils, "url", {
              configurable: true,
              enumerable: true,
              writable: true,
              value: {
                resolve(base: string, path: string) {
                  try {
                    return new URL(path, base).href;
                  } catch {
                    return path;
                  }
                },
                parse(input: string) {
                  try {
                    const u = new URL(input);
                    return {
                      protocol: u.protocol,
                      slashes: true,
                      auth: u.username ? `${u.username}:${u.password}` : null,
                      host: u.host,
                      port: u.port,
                      hostname: u.hostname,
                      hash: u.hash,
                      search: u.search,
                      query: u.search.startsWith("?") ? u.search.slice(1) : u.search,
                      pathname: u.pathname,
                      path: u.pathname + u.search,
                      href: u.href,
                    };
                  } catch {
                    return { href: input, pathname: input, path: input };
                  }
                },
              },
            });
          }
        } catch {
          /* property locked — warning will fire once, harmless */
        }
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
          // `autoInteract` was deprecated in pixi-live2d-display v0.5.0 in
          // favour of these two granular flags. We drive both hit-testing
          // and focus tracking ourselves (see onPointerDown/onMove below),
          // so disable the library's global listeners.
          autoHitTest: false,
          autoFocus: false,
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
        modelRef.current = {
          model: model as unknown as ModelRef["model"],
          anchored,
          canvasW: width,
          canvasH: height,
        };
        applyLayout();

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
              setParamFloat?: (id: string, value: number) => void;
              setParameterValueByIndex?: (index: number, value: number) => void;
              getParameterIndex?: (id: string) => number;
            };
          };
        }).internalModel?.coreModel;

        if (coreModel) {
          const apis = [
            typeof coreModel.setParameterValueById === "function" && "ById",
            typeof coreModel.setParamFloat === "function" && "ParamFloat",
            typeof coreModel.setParameterValueByIndex === "function" &&
              "ByIndex",
          ].filter(Boolean);
          console.log(
            `[live2d] runtime=${runtime} coreModel APIs: [${apis.join(", ")}]`,
          );
        } else {
          console.warn("[live2d] no coreModel — lipsync will be disabled");
        }

        // Parameter naming differs between Cubism 2 and Cubism 4 models:
        //   Cubism 4 → "ParamMouthOpenY", "ParamAngleX", …
        //   Cubism 2 → "PARAM_MOUTH_OPEN_Y", "PARAM_ANGLE_X", …
        // We try the runtime-specific name first and fall back to the other
        // naming convention transparently, so one code path drives both.
        //
        // `mouthIds` is a *list* — many Cubism 4/5 sample models (mao_pro,
        // Hiyori, …) declare their LipSync group as one or more of the
        // Japanese vowel parameters (ParamA/I/U/E/O) instead of the generic
        // ParamMouthOpenY, so we always drive every common candidate; the
        // ones the model doesn't expose silently no-op.
        const P = runtime === "cubism4"
          ? {
              mouthIds: ["ParamMouthOpenY", "ParamA", "ParamI", "ParamU", "ParamE", "ParamO"],
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
              mouthIds: ["PARAM_MOUTH_OPEN_Y"],
              angleX: "PARAM_ANGLE_X",
              angleY: "PARAM_ANGLE_Y",
              bodyX: "PARAM_BODY_ANGLE_X",
              breath: "PARAM_BREATH",
              eyeLOpen: "PARAM_EYE_L_OPEN",
              eyeROpen: "PARAM_EYE_R_OPEN",
              eyeBallX: "PARAM_EYE_BALL_X",
              eyeBallY: "PARAM_EYE_BALL_Y",
            };

        // If the model3.json declares an explicit LipSync parameter group,
        // honour it: those IDs are always the right ones to drive.
        const declaredLipSyncIds: string[] = (() => {
          try {
            const settings = (model as unknown as {
              internalModel?: { settings?: { groups?: Array<{ Name?: string; Ids?: string[] }> } };
            }).internalModel?.settings;
            const groups = settings?.groups ?? [];
            const grp = groups.find((g) => g?.Name === "LipSync");
            return Array.isArray(grp?.Ids) ? grp!.Ids! : [];
          } catch {
            return [];
          }
        })();
        if (declaredLipSyncIds.length > 0) {
          // Move declared IDs to the front and dedupe.
          const merged = [...declaredLipSyncIds];
          for (const id of P.mouthIds) if (!merged.includes(id)) merged.push(id);
          P.mouthIds = merged;
          console.log(`[live2d] LipSync group: [${declaredLipSyncIds.join(", ")}]`);
        }

        // Idle body sway: gentle sinusoidal drift on head/body params.
        // Keeps the character visibly alive when no motion is playing.
        const bornAt = performance.now();

        // Track mouse for natural eye-tracking (within canvas bounds).
        // We use pixi-live2d-display's built-in `focus(x, y)` API: it
        // smoothly drives ParamAngle*/ParamBodyAngle*/ParamEyeBall* with
        // damping AND cooperates with the model's physics/idle motions
        // (which would otherwise overwrite directly-set parameters every
        // frame, hiding the tracking effect entirely).
        const container = containerRef.current;
        const focusable = model as unknown as {
          focus?: (x: number, y: number, instant?: boolean) => void;
        };
        const onMove = (e: PointerEvent) => {
          if (!container) return;
          const r = container.getBoundingClientRect();
          const px = e.clientX - r.left;
          const py = e.clientY - r.top;
          if (typeof focusable.focus === "function") {
            try {
              focusable.focus(px, py);
            } catch {
              /* ignore — some runtimes don't expose focus */
            }
          }
        };
        window.addEventListener("pointermove", onMove);

        // Blink on a stochastic schedule, like a human.
        let nextBlinkAt = performance.now() + 2000 + Math.random() * 3000;
        let blinkStart = 0;
        const BLINK_MS = 140;

        const applyMouth = () => {
          const now = performance.now();
          const t = (now - bornAt) / 1000;
          if (!coreModel) return;
          // Mouth from envelope; exaggerate a bit so small RMS still visible.
          // Drive every candidate LipSync param — the model only owns a
          // subset and the rest no-op silently.
          const mouthVal = Math.min(1, mouth * 1.6);
          for (const id of P.mouthIds) trySet(coreModel, id, mouthVal);
          // Head/eye angles are driven by `model.focus(...)` (see onMove);
          // we only add subtle body sway and breathing so she still feels
          // alive when the cursor is parked.
          trySet(coreModel, P.bodyX, Math.sin(t * 0.3) * 3);
          trySet(coreModel, P.breath, 0.5 + Math.sin(t * 1.2) * 0.5);
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
            console.log(`[avatar] emotion → ${s.emotion}`);
            tryExpressionAny(model, EXPRESSION_MAP[s.emotion]);
            const emotionMotion = EMOTION_MOTION_MAP[s.emotion];
            if (emotionMotion) tryMotionAny(model, emotionMotion);
          }
          if (s.mode !== lastMode) {
            lastMode = s.mode;
            const motion = MOTION_MAP[s.mode];
            if (motion) tryMotionAny(model, [motion]);
          }
        });

        // Periodic "special" motion when idle — every 45–90 s the avatar
        // plays one of the model's flair animations (e.g. mao_pro's brush
        // strokes via special_01..03), so she feels alive instead of
        // statically idling. Skipped while she is speaking or listening.
        //
        // mao_pro packs ALL non-idle motions (mtn_02..04 + special_01..03)
        // into the unnamed group `""` of the model3.json, so we randomise
        // an index within that group on top of trying conventional names.
        let nextSpecialAt = performance.now() + 30000 + Math.random() * 30000;
        const specialTimer = window.setInterval(() => {
          const now = performance.now();
          if (now < nextSpecialAt) return;
          if (lastMode !== "idle") return;
          const played = tryMotionAny(model, [
            "special_01",
            "special_02",
            "special_03",
            "Special",
            "TapSpecial",
          ]);
          if (!played) {
            // mao_pro's "" group has 6 entries (indices 0–5); 3–5 are the
            // brush "special" animations. Picking a random one keeps the
            // performance varied.
            tryMotion(model, "", 3 + Math.floor(Math.random() * 3));
          }
          nextSpecialAt = now + 45000 + Math.random() * 45000;
        }, 5000);

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
          // Three vertical zones — the lower third of the avatar covers
          // her hand holding the paint brush, so taps there should always
          // play the brush-stroke specials and trigger the "drawing"
          // reaction kind. Mid-body falls through to body taps.
          const zone = ny < 0.33 ? "head" : ny > 0.7 ? "hand" : "body";
          const headGroups = ["tap_head", "TapHead"];
          let played = false;
          if (zone === "head") {
            played = tryMotionAny(model, headGroups);
          }
          if (!played) {
            // Indices 3, 4, 5 of group "" map to special_01/02/03 in
            // mao_pro.model3.json — the brush-stroke animations.
            const idx = 3 + Math.floor(Math.random() * 3);
            played = tryMotion(model, "", idx);
          }
          if (!played) {
            // Last-ditch fallback: try named special groups.
            tryMotionAny(model, ["special_01", "special_02", "special_03"]);
          }
          // Fire-and-forget reaction line through whichever TTS provider
          // is active. Silent when TTS is disabled. The Rust side now
          // generates the line via LLM (mode-aware, multilingual) and
          // falls back to canned localized strings on timeout.
          invoke("speak_reaction", { zone }).catch(() => {});
        };
        canvas.addEventListener("pointerdown", onPointerDown);
        canvas.addEventListener("pointerup", onPointerUp);

        cleanup = () => {
          modelRef.current = null;
          unsubscribe();
          unsubState();
          window.removeEventListener("pointermove", onMove);
          window.clearInterval(specialTimer);
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
 *
 * Each emotion maps to an ordered list of candidate names — Komorebi tries
 * them in turn so the same code works for models that name expressions
 * descriptively (`happy`, `sad`) AND for SDK samples that use generic IDs
 * (`exp_01`..`exp_08`, e.g. mao_pro Cubism 5 default).
 */
const EXPRESSION_MAP: Record<Emotion, string[]> = {
  neutral: ["neutral", "default", "exp_02"],
  happy: ["happy", "smile", "joy", "exp_01"],
  sad: ["sad", "down", "cry", "exp_03"],
  angry: ["angry", "mad", "annoyed", "exp_05", "exp_04"],
  surprised: ["surprised", "shocked", "wow", "exp_06", "exp_07"],
  thinking: ["thinking", "think", "doubt", "exp_08"],
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
 * models (no expression files) still show emotion via motions, and lets
 * Cubism 4/5 sample models (mao_pro et al.) pick up generic `mtn_NN`
 * names too.
 */
const EMOTION_MOTION_MAP: Record<Emotion, string[]> = {
  neutral: [],
  happy: ["Happy", "happy", "tap_body", "TapBody", "mtn_02"],
  sad: ["Sad", "sad", "mtn_03"],
  angry: ["Angry", "angry", "mtn_04"],
  surprised: [
    "Surprised",
    "surprised",
    "tap_head",
    "TapHead",
    "special_01",
    "special_02",
  ],
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

function tryMotionAny(model: unknown, groups: string[]): boolean {
  for (const g of groups) {
    if (tryMotion(model, g)) return true;
  }
  return false;
}

function tryExpression(model: unknown, name: string): boolean {
  const m = model as ExpressiveModel;
  if (typeof m.expression !== "function") return false;
  try {
    const r = m.expression(name);
    // pixi-live2d-display returns false / a Promise<boolean> / undefined.
    if (r === false) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the expression names declared in the loaded `.model3.json`
 * (Cubism 4/5) or `.model.json` (Cubism 2). Used so we only call
 * `model.expression(name)` with names that actually exist — the library
 * returns a Promise that may resolve to `false` for missing names, so we
 * can't reliably probe by trying.
 */
function listExpressionNames(model: unknown): string[] {
  try {
    const settings = (model as unknown as {
      internalModel?: {
        settings?: {
          expressions?: Array<{ Name?: string; name?: string; File?: string; file?: string }>;
        };
      };
    }).internalModel?.settings;
    const list = settings?.expressions ?? [];
    return list
      .map((e) => e?.Name ?? e?.name ?? "")
      .filter((s): s is string => !!s);
  } catch {
    return [];
  }
}

/** Try a list of candidate expression names and play the first one
 *  the loaded model actually defines. Logs the chosen name for debugging. */
function tryExpressionAny(model: unknown, names: string[]) {
  const available = listExpressionNames(model);
  for (const n of names) {
    if (available.length > 0 && !available.includes(n)) continue;
    if (tryExpression(model, n)) {
      console.log(`[live2d] expression → ${n}`);
      return;
    }
  }
  if (available.length > 0) {
    console.log(
      `[live2d] expression: none of [${names.join(", ")}] found in model (available: [${available.join(", ")}])`,
    );
  }
}

function tryMotion(model: unknown, group: string, index?: number): boolean {
  const m = model as ExpressiveModel;
  if (typeof m.motion !== "function") return false;
  try {
    // Priority 2 = NORMAL in pixi-live2d-display; lets idle interrupt nothing
    // but intentional mode motions interrupt idle.
    const result = m.motion(group, index, 2);
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
  coreModel: {
    setParameterValueById?: (id: string, value: number) => void;
    setParamFloat?: (id: string, value: number) => void;
    setParameterValueByIndex?: (index: number, value: number) => void;
    getParameterIndex?: (id: string) => number;
  },
  id: string,
  value: number,
) {
  try {
    if (typeof coreModel.setParameterValueById === "function") {
      coreModel.setParameterValueById(id, value);
      return;
    }
    // Cubism 2 core exposes `setParamFloat(id, value)` instead.
    if (typeof coreModel.setParamFloat === "function") {
      coreModel.setParamFloat(id, value);
      return;
    }
    // Last resort: index-based API (some Cubism 2 builds).
    if (
      typeof coreModel.getParameterIndex === "function" &&
      typeof coreModel.setParameterValueByIndex === "function"
    ) {
      const idx = coreModel.getParameterIndex(id);
      if (idx >= 0) coreModel.setParameterValueByIndex(idx, value);
    }
  } catch {
    /* parameter missing on this model */
  }
}
