import { ReactNode } from "react";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
}

/**
 * Uiverse Floating Neon Tooltip Component.
 * Wraps any element and displays a smooth floating cyan neon tooltip on hover.
 */
export default function Tooltip({
  content,
  children,
  position = "top",
  className = "",
}: TooltipProps) {
  if (!content) return <>{children}</>;

  return (
    <div className={`uiverse-tooltip-wrapper uiverse-tooltip-${position} ${className}`}>
      {children}
      <span className="uiverse-tooltip-bubble" role="tooltip">
        {content}
      </span>
    </div>
  );
}
