import React from "react";

interface CloseButtonProps {
  onClick: () => void;
  title?: string;
  size?: number; // overall button size in px (default 32)
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Animated X close button with hover-to-red effect and tooltip.
 * Used across panels, modals, and drawers — everywhere except the widget-mode close.
 */
export default function CloseButton({
  onClick,
  title = "Close",
  size = 32,
  className = "",
  style,
}: CloseButtonProps) {
  const crossLen = size * 0.5;      // length of the X arms
  const crossThick = 1.5;           // thickness

  return (
    <button
      type="button"
      className={`fancy-close-btn ${className}`}
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        position: "relative",
        width: size,
        height: size,
        border: "none",
        background: "rgba(180, 83, 107, 0.11)",
        borderRadius: 5,
        cursor: "pointer",
        padding: 0,
        transition: "background 0.5s",
        flexShrink: 0,
        ...style,
      }}
    >
      {/* First arm of X (45°) */}
      <span
        style={{
          content: '""',
          position: "absolute",
          top: "50%",
          left: "50%",
          width: crossLen,
          height: crossThick,
          backgroundColor: "#fff",
          transform: "translateX(-50%) rotate(45deg)",
          pointerEvents: "none",
        }}
      />
      {/* Second arm of X (-45°) */}
      <span
        style={{
          content: '""',
          position: "absolute",
          top: "50%",
          left: "50%",
          width: crossLen,
          height: crossThick,
          backgroundColor: "#fff",
          transform: "translateX(-50%) rotate(-45deg)",
          pointerEvents: "none",
        }}
      />
      {/* Tooltip */}
      <span className="fancy-close-tooltip">{title}</span>
    </button>
  );
}
