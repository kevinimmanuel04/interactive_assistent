import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { avatarState, AvatarState } from "../avatarState";
import type { Emotion } from "../emotion";

/**
 * SVG placeholder shown when no Live2D model is configured (or the runtime
 * isn't available). Gently breathes and blinks to feel alive, and reflects
 * the current avatar state (listening / thinking / speaking + emotion).
 */
export default function AnimatedPlaceholder() {
  // Random blinks every 3-6 seconds.
  const [blink, setBlink] = useState(false);
  const [state, setState] = useState<AvatarState>(avatarState.current);

  useEffect(() => avatarState.subscribe(setState), []);
  useEffect(() => {
    let cancelled = false;
    const loop = () => {
      const delay = 3000 + Math.random() * 3000;
      window.setTimeout(() => {
        if (cancelled) return;
        setBlink(true);
        window.setTimeout(() => !cancelled && setBlink(false), 140);
        loop();
      }, delay);
    };
    loop();
    return () => {
      cancelled = true;
    };
  }, []);

  const cheek = CHEEK_FOR[state.emotion];
  const mouth = MOUTH_FOR[state.emotion];
  const speaking = state.mode === "speaking";
  const thinking = state.mode === "thinking";
  const listening = state.mode === "listening";

  return (
    <motion.svg
      viewBox="0 0 200 280"
      width="100%"
      height="100%"
      style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.35))" }}
      initial={{ scale: 1 }}
      animate={{
        // Slightly faster "breathing" while speaking, a gentle lean while listening.
        scale: speaking ? [1, 1.03, 1] : [1, 1.02, 1],
        rotate: listening ? [-1.5, 1.5, -1.5] : 0,
      }}
      transition={{
        duration: speaking ? 1.4 : 3.2,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      <defs>
        <linearGradient id="hair" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#c8a2ff" />
          <stop offset="100%" stopColor="#8e6ee0" />
        </linearGradient>
        <linearGradient id="skin" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffe6f0" />
          <stop offset="100%" stopColor="#ffc1d9" />
        </linearGradient>
        <linearGradient id="body" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffd8ec" />
          <stop offset="100%" stopColor="#b39ddb" />
        </linearGradient>
      </defs>
      {/* back hair */}
      <ellipse cx="100" cy="90" rx="58" ry="62" fill="url(#hair)" />
      {/* face */}
      <ellipse cx="100" cy="96" rx="40" ry="46" fill="url(#skin)" />
      {/* front bangs */}
      <path
        d="M60 78 Q100 40 140 78 Q130 70 120 82 Q110 70 100 82 Q90 70 80 82 Q70 70 60 78 Z"
        fill="url(#hair)"
      />
      {/* eyes */}
      <motion.g
        animate={{ scaleY: blink ? 0.05 : 1 }}
        transition={{ duration: 0.08 }}
        style={{ transformOrigin: "100px 100px" }}
      >
        <ellipse
          cx="86"
          cy="100"
          rx={state.emotion === "surprised" ? 5 : 4}
          ry={state.emotion === "surprised" ? 8 : state.emotion === "happy" ? 4 : 6}
          fill="#4a2e6e"
        />
        <ellipse
          cx="114"
          cy="100"
          rx={state.emotion === "surprised" ? 5 : 4}
          ry={state.emotion === "surprised" ? 8 : state.emotion === "happy" ? 4 : 6}
          fill="#4a2e6e"
        />
      </motion.g>
      {/* cheeks */}
      <circle cx="80" cy="114" r="4" fill={cheek} opacity="0.75" />
      <circle cx="120" cy="114" r="4" fill={cheek} opacity="0.75" />
      {/* mouth */}
      <motion.path
        d={mouth}
        stroke="#a86b8a"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        animate={speaking ? { scaleY: [1, 1.6, 1] } : { scaleY: 1 }}
        transition={{ duration: 0.35, repeat: speaking ? Infinity : 0 }}
        style={{ transformOrigin: "100px 122px" }}
      />
      {/* body / dress */}
      <path
        d="M50 270 Q100 160 150 270 Z"
        fill="url(#body)"
        opacity="0.95"
      />
      <circle cx="100" cy="170" r="14" fill="url(#skin)" />
      {/* Thinking indicator: three dots above the head. */}
      {thinking && (
        <motion.g
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          <circle cx="140" cy="50" r="3" fill="#8e6ee0" />
          <circle cx="150" cy="46" r="3" fill="#8e6ee0" />
          <circle cx="160" cy="50" r="3" fill="#8e6ee0" />
        </motion.g>
      )}
      {/* Listening indicator: pulsing ring around the ear. */}
      {listening && (
        <motion.circle
          cx="60"
          cy="102"
          r="6"
          fill="none"
          stroke="#6fae5a"
          strokeWidth="1.5"
          animate={{ r: [6, 12, 6], opacity: [0.8, 0, 0.8] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
      )}
    </motion.svg>
  );
}

const CHEEK_FOR: Record<Emotion, string> = {
  neutral: "#ffb3c6",
  happy: "#ff8aa8",
  sad: "#c7a3c2",
  angry: "#ff7373",
  surprised: "#ffc1a1",
  thinking: "#d9c8e8",
};

// Mouth paths share the same bounding box (94..106 horizontally, 122 ±4
// vertically) so the speaking pulse animation transforms consistently.
const MOUTH_FOR: Record<Emotion, string> = {
  neutral: "M94 122 Q100 126 106 122",
  happy: "M92 121 Q100 131 108 121",
  sad: "M94 126 Q100 120 106 126",
  angry: "M94 124 L106 120",
  surprised: "M97 121 Q100 128 103 121 Q100 118 97 121 Z",
  thinking: "M95 123 L105 121",
};
