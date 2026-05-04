// Generic horizontal range slider used by Avatar layout, Prosody (TTS) and
// SoVITS speed controls. `onChange` fires on every drag tick (for live
// preview); `onCommit` fires on pointer-up / key-up (for persisting).
//
// Keeping these two callbacks separate lets sliders drive a smooth visual
// preview while still saving only the final value to disk, avoiding a
// burst of writes during dragging.

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  disabled?: boolean;
}

export default function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  onCommit,
  disabled,
}: SliderProps) {
  return (
    <label style={{ display: "block", fontSize: 11, marginTop: 6 }}>
      <div style={{ opacity: 0.8, marginBottom: 2 }}>{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        style={{ width: "100%" }}
      />
    </label>
  );
}
