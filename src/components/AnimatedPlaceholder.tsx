import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * SVG placeholder shown when no Live2D model is configured (or the runtime
 * isn't available). Gently breathes and blinks to feel alive.
 */
export default function AnimatedPlaceholder() {
  // Random blinks every 3-6 seconds.
  const [blink, setBlink] = useState(false);
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

  return (
    <motion.svg
      viewBox="0 0 200 280"
      width="100%"
      height="100%"
      style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.35))" }}
      initial={{ scale: 1 }}
      animate={{ scale: [1, 1.02, 1] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
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
        <ellipse cx="86" cy="100" rx="4" ry="6" fill="#4a2e6e" />
        <ellipse cx="114" cy="100" rx="4" ry="6" fill="#4a2e6e" />
      </motion.g>
      {/* cheeks */}
      <circle cx="80" cy="114" r="4" fill="#ffb3c6" opacity="0.7" />
      <circle cx="120" cy="114" r="4" fill="#ffb3c6" opacity="0.7" />
      {/* mouth */}
      <path
        d="M94 122 Q100 126 106 122"
        stroke="#a86b8a"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* body / dress */}
      <path
        d="M50 270 Q100 160 150 270 Z"
        fill="url(#body)"
        opacity="0.95"
      />
      <circle cx="100" cy="170" r="14" fill="url(#skin)" />
    </motion.svg>
  );
}
