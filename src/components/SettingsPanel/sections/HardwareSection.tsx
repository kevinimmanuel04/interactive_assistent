// Hardware: audio device + GPU mode + auto-listen toggle. The GPU tri-mode
// (auto / cpu / gpu) maps to llm_gpu_layers as: null = auto, 0 = cpu,
// 999 = "load everything to GPU". The 999 sentinel is a llama.cpp idiom —
// it asks the runtime to push every available layer to VRAM.

import { useEffect, useState } from "react";
import {
  listAudioDevices,
  setAudioInput,
  setAudioOutput,
  setAutoListen,
  setLlmGpuLayers,
  systemInfo,
  type PublicSettings,
  type SystemInfo,
} from "../../../api";
import { t, useLocale } from "../../../i18n";
import { inputStyle } from "../styles";

interface AudioDevices {
  inputs: string[];
  outputs: string[];
  default_input: string | null;
  default_output: string | null;
}

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function HardwareSection({ settings, refresh }: Props) {
  useLocale();
  const [devices, setDevices] = useState<AudioDevices | null>(null);
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listAudioDevices()
      .then(setDevices)
      .catch(() => {});
    systemInfo()
      .then(setSys)
      .catch(() => {});
  }, []);

  const inVal = settings?.audio_input_device ?? "";
  const outVal = settings?.audio_output_device ?? "";
  const gpuSetting = settings?.llm_gpu_layers;
  // null = auto; 0 = CPU; -1 / large = GPU all
  const gpuMode: "auto" | "cpu" | "gpu" =
    gpuSetting === null || gpuSetting === undefined
      ? "auto"
      : gpuSetting === 0
        ? "cpu"
        : "gpu";

  const setGpu = async (mode: "auto" | "cpu" | "gpu") => {
    setBusy(true);
    try {
      const v = mode === "auto" ? null : mode === "cpu" ? 0 : 999;
      await setLlmGpuLayers(v);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const setInput = async (device: string) => {
    setBusy(true);
    try {
      await setAudioInput(device);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const setOutput = async (device: string) => {
    setBusy(true);
    try {
      await setAudioOutput(device);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoListen = async (on: boolean) => {
    setBusy(true);
    try {
      await setAutoListen(on);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>{t("settings.hw.title")}</div>

      <div style={{ opacity: 0.5, fontSize: 11, marginBottom: 8 }}>
        {sys
          ? `${sys.os} • ${sys.cpu} (${sys.cpu_cores}c) • ${sys.ram_gb} GB RAM${
              sys.gpus.length ? ` • GPU: ${sys.gpus.join(", ")}` : ""
            }`
          : "…"}
      </div>

      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        <label style={{ opacity: 0.7, fontSize: 12 }}>{t("settings.hw.mic")}</label>
        <select
          value={inVal}
          disabled={busy || !devices}
          onChange={(e) => setInput(e.target.value)}
          style={inputStyle}
        >
          <option value="">
            {t("settings.hw.default", {
              info: devices?.default_input ? ` (${devices.default_input})` : "",
            })}
          </option>
          {devices?.inputs.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        <label style={{ opacity: 0.7, fontSize: 12 }}>{t("settings.hw.speaker")}</label>
        <select
          value={outVal}
          disabled={busy || !devices}
          onChange={(e) => setOutput(e.target.value)}
          style={inputStyle}
        >
          <option value="">
            {t("settings.hw.default", {
              info: devices?.default_output
                ? ` (${devices.default_output})`
                : "",
            })}
          </option>
          {devices?.outputs.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ opacity: 0.7, fontSize: 12 }}>
          {t("settings.hw.gpu.title")}
        </label>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {(["auto", "cpu", "gpu"] as const).map((m) => {
            const active = gpuMode === m;
            const disabled =
              m === "gpu" && sys !== null && sys.has_nvidia === false;
            return (
              <button
                key={m}
                disabled={busy || disabled}
                onClick={() => setGpu(m)}
                title={
                  m === "gpu" && disabled
                    ? t("settings.hw.gpu.disabled")
                    : undefined
                }
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: active
                    ? "1px solid rgba(255,255,255,0.55)"
                    : "1px solid rgba(255,255,255,0.1)",
                  background: active
                    ? "rgba(255,255,255,0.08)"
                    : "transparent",
                  color: disabled ? "#666" : "#fff",
                  cursor: disabled ? "not-allowed" : "pointer",
                  textTransform: "uppercase",
                  fontSize: 11,
                }}
              >
                {m === "auto"
                  ? t("settings.hw.gpu.auto")
                  : m === "cpu"
                    ? t("settings.hw.gpu.cpu")
                    : t("settings.hw.gpu.gpu")}
              </button>
            );
          })}
        </div>
        <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
          {t("settings.hw.gpu.hint")}
        </div>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          opacity: 0.9,
        }}
      >
        <input
          type="checkbox"
          checked={settings?.auto_listen ?? false}
          disabled={busy}
          onChange={(e) => toggleAutoListen(e.target.checked)}
        />
        {t("settings.hw.auto_listen")}
      </label>
    </div>
  );
}
