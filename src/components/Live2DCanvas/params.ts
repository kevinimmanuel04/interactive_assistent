import type { Emotion } from "../../emotion";
import type { AvatarState } from "../../avatarState";
import type { Runtime } from "./runtime";

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
export const EXPRESSION_MAP: Record<Emotion, string[]> = {
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
export const MOTION_MAP: Record<AvatarState["mode"], string | null> = {
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
export const EMOTION_MOTION_MAP: Record<Emotion, string[]> = {
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

export interface RuntimeParams {
  mouthIds: string[];
  angleX: string;
  angleY: string;
  bodyX: string;
  breath: string;
  eyeLOpen: string;
  eyeROpen: string;
  eyeBallX: string;
  eyeBallY: string;
}

/**
 * Parameter naming differs between Cubism 2 and Cubism 4 models:
 *   Cubism 4 → "ParamMouthOpenY", "ParamAngleX", …
 *   Cubism 2 → "PARAM_MOUTH_OPEN_Y", "PARAM_ANGLE_X", …
 *
 * `mouthIds` is a *list* — many Cubism 4/5 sample models (mao_pro,
 * Hiyori, …) declare their LipSync group as one or more of the Japanese
 * vowel parameters (ParamA/I/U/E/O) instead of the generic
 * ParamMouthOpenY, so we always drive every common candidate; the ones
 * the model doesn't expose silently no-op.
 */
export function paramSetFor(runtime: Runtime): RuntimeParams {
  return runtime === "cubism4"
    ? {
        mouthIds: [
          "ParamMouthOpenY",
          "ParamA",
          "ParamI",
          "ParamU",
          "ParamE",
          "ParamO",
        ],
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
}
