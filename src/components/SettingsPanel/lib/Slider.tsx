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
  gradientClass?: string;
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
  gradientClass = "slider-gradient-1",
}: SliderProps) {
  return (
    <div style={{ margin: "10px 0" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>
        {label}
      </div>
      <div className="slider-wrapper">
        <input
          type="range"
          className={`slider ${gradientClass}`}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
        />
      </div>
    </div>
  );
}
