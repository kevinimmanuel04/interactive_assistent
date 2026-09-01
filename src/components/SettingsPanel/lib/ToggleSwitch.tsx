import type { CSSProperties } from "react";
import { useId } from "react";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  sublabel?: string;
  disabled?: boolean;
  style?: CSSProperties;
}

export default function ToggleSwitch({
  checked,
  onChange,
  label,
  sublabel,
  disabled = false,
  style,
}: ToggleSwitchProps) {
  const switchId = useId();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        userSelect: "none",
        ...style,
      }}
    >
      {(label || sublabel) && (
        <div style={{ flex: 1 }}>
          {label && <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{label}</div>}
          {sublabel && <div style={{ fontSize: 11, color: "#aaa", marginTop: 2, lineHeight: 1.3 }}>{sublabel}</div>}
        </div>
      )}
      <div className="custom-toggle-border">
        <input
          id={switchId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => !disabled && onChange(e.target.checked)}
        />
        <label htmlFor={switchId}>
          <div className="custom-toggle-handle" />
        </label>
      </div>
    </div>
  );
}
