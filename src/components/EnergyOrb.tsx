import { motion } from "framer-motion";
import React from "react";

interface Props {
  size?: number;
  mode?: "icon" | "background";
  className?: string;
  style?: React.CSSProperties;
}

export default function EnergyOrb({
  size = 36,
  mode = "icon",
  className,
  style,
}: Props) {
  const isBg = mode === "background";
  const targetScale = isBg ? 2.8 : size / 100;
  const targetOpacity = isBg ? 0.25 : 1;
  const targetBlur = isBg ? "14px" : "0px";

  return (
    <motion.div
      className={`energy-orb-container ${className || ""}`}
      initial={false}
      animate={{
        scale: targetScale,
        opacity: targetOpacity,
        filter: `blur(${targetBlur})`,
      }}
      transition={{
        duration: 1.4, // Cinematic 1.4s smooth morph
        ease: [0.25, 1, 0.5, 1],
      }}
      style={{
        width: 100,
        height: 100,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transformOrigin: "center center",
        pointerEvents: "none",
        ...style,
      }}
    >
      <div className="energy-loader">
        <svg width={100} height={100} viewBox="0 0 100 100">
          <defs>
            <mask id="energy-clipping">
              <polygon points="0,0 100,0 100,100 0,100" fill="black" />
              <polygon points="25,25 75,25 50,75" fill="white" />
              <polygon points="50,25 75,75 25,75" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
            </mask>
          </defs>
        </svg>
        <div className="energy-box" />
      </div>
    </motion.div>
  );
}
