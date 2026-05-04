// Prosody controls (length / noise / volume) shown under TTS section.
// Length / noise / noise-w are committed together via setTtsProsody;
// volume has its own atomic setter that fires on every change for live
// monitoring while the user drags.

import { useEffect, useState } from "react";
import {
  setTtsProsody,
  setTtsVolume,
  type PublicSettings,
} from "../../../../api";
import { t, useLocale } from "../../../../i18n";
import Slider from "../../lib/Slider";
import { subCardStyle } from "../../styles";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function ProsodySection({ settings, refresh }: Props) {
  useLocale();
  const [length, setLength] = useState<number>(settings?.tts_length_scale ?? 1);
  const [noise, setNoise] = useState<number>(settings?.tts_noise_scale ?? 0.667);
  const [noiseW, setNoiseW] = useState<number>(settings?.tts_noise_w ?? 0.8);
  const [volume, setVolume] = useState<number>(settings?.tts_volume ?? 1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLength(settings?.tts_length_scale ?? 1);
    setNoise(settings?.tts_noise_scale ?? 0.667);
    setNoiseW(settings?.tts_noise_w ?? 0.8);
    setVolume(settings?.tts_volume ?? 1);
  }, [
    settings?.tts_length_scale,
    settings?.tts_noise_scale,
    settings?.tts_noise_w,
    settings?.tts_volume,
  ]);

  const commitProsody = async () => {
    setBusy(true);
    try {
      await setTtsProsody(length, noise, noiseW);
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const commitVolume = async (v: number) => {
    await setTtsVolume(v);
    await refresh();
  };

  return (
    <div style={subCardStyle}>
      <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 4 }}>
        {t("settings.prosody.title")}
      </div>
      <Slider
        label={t("settings.prosody.speed", { value: length.toFixed(2) })}
        min={0.5}
        max={1.6}
        step={0.05}
        value={length}
        onChange={setLength}
        onCommit={commitProsody}
        disabled={busy}
      />
      <Slider
        label={t("settings.prosody.expressive", { value: noise.toFixed(2) })}
        min={0.1}
        max={1.2}
        step={0.05}
        value={noise}
        onChange={setNoise}
        onCommit={commitProsody}
        disabled={busy}
      />
      <Slider
        label={t("settings.prosody.rhythm", { value: noiseW.toFixed(2) })}
        min={0.1}
        max={1.2}
        step={0.05}
        value={noiseW}
        onChange={setNoiseW}
        onCommit={commitProsody}
        disabled={busy}
      />
      <Slider
        label={t("settings.prosody.volume", {
          value: String(Math.round(volume * 100)),
        })}
        min={0}
        max={1.5}
        step={0.05}
        value={volume}
        onChange={(v) => {
          setVolume(v);
          void commitVolume(v);
        }}
        onCommit={() => {}}
      />
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 4 }}>
        {t("settings.prosody.tip")}
      </div>
    </div>
  );
}
