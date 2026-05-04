// Local LoRA training (Phase 2 stub — see ADR 0004).
// All controls are gated behind `local_model_path` being configured: until
// the user has a local model, the toggle and sliders are disabled and we
// surface "coming soon" copy. The settings here are forwarded to the Rust
// trainer worker but no actual training pipeline runs in this phase.

import {
  setTrainingBatteryFloorPct,
  setTrainingEnabled,
  setTrainingMaxCpuPct,
  setTrainingMinExamples,
  setTrainingSchedule,
  type PublicSettings,
} from "../../../../api";
import { t, useLocale } from "../../../../i18n";
import { h3Style, hintStyle, inputStyle, sectionStyle } from "../../styles";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function TrainingSection({ settings, refresh }: Props) {
  useLocale();
  const enabled = !!settings?.training_enabled;
  const maxCpu = settings?.training_max_cpu_pct ?? 50;
  const batteryFloor = settings?.training_battery_floor_pct ?? 40;
  const minExamples = settings?.training_min_examples ?? 100;
  const schedule = settings?.training_schedule ?? "manual";
  const hasLocalModel = !!settings?.local_model_path;

  return (
    <section style={sectionStyle}>
      <h3 style={h3Style}>🧠 {t("settings.training.title")}</h3>
      <p style={hintStyle}>{t("settings.training.hint")}</p>
      <p style={{ ...hintStyle, opacity: 0.55 }}>
        {t("settings.training.coming_soon")}
      </p>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          opacity: hasLocalModel ? 1 : 0.55,
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={!hasLocalModel}
          onChange={async (e) => {
            await setTrainingEnabled(e.target.checked);
            await refresh();
          }}
        />
        <span>{t("settings.training.enable")}</span>
      </label>
      <label style={{ display: "block", fontSize: 12, opacity: 0.75 }}>
        {t("settings.training.max_cpu")}: {maxCpu}%
      </label>
      <input
        type="range"
        min={5}
        max={95}
        step={5}
        value={maxCpu}
        disabled={!hasLocalModel}
        onChange={async (e) => {
          await setTrainingMaxCpuPct(Number(e.target.value));
          await refresh();
        }}
        style={{ width: "100%" }}
      />
      <label
        style={{
          display: "block",
          fontSize: 12,
          opacity: 0.75,
          marginTop: 6,
        }}
      >
        {t("settings.training.battery_floor")}: {batteryFloor}%
      </label>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={batteryFloor}
        disabled={!hasLocalModel}
        onChange={async (e) => {
          await setTrainingBatteryFloorPct(Number(e.target.value));
          await refresh();
        }}
        style={{ width: "100%" }}
      />
      <label
        style={{
          display: "block",
          fontSize: 12,
          opacity: 0.75,
          marginTop: 6,
        }}
      >
        {t("settings.training.min_examples")}
      </label>
      <input
        type="number"
        min={10}
        max={100000}
        step={10}
        value={minExamples}
        disabled={!hasLocalModel}
        onChange={async (e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) {
            await setTrainingMinExamples(n);
            await refresh();
          }
        }}
        style={inputStyle}
      />
      <label
        style={{
          display: "block",
          fontSize: 12,
          opacity: 0.75,
          marginTop: 6,
        }}
      >
        {t("settings.training.schedule.label")}
      </label>
      <select
        value={schedule}
        disabled={!hasLocalModel}
        onChange={async (e) => {
          await setTrainingSchedule(e.target.value);
          await refresh();
        }}
        style={inputStyle}
      >
        <option value="manual">{t("settings.training.schedule.manual")}</option>
        <option value="idle">{t("settings.training.schedule.idle")}</option>
        <option value="scheduled">
          {t("settings.training.schedule.scheduled")}
        </option>
      </select>
    </section>
  );
}
