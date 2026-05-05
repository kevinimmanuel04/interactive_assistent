// Weather settings: provider (free Open-Meteo vs key-gated OpenWeatherMap),
// optional API key, default city, geolocation toggle, units. The API-key
// field is hidden unless the user picks OpenWeatherMap, since Open-Meteo
// doesn't require one.

import { useEffect, useState } from "react";
import {
  clearWeatherApiKey,
  setWeatherApiKey,
  setWeatherDefaultCity,
  setWeatherProvider,
  setWeatherUnits,
  setWeatherUseIp,
  type PublicSettings,
} from "../../../../api";
import { t, useLocale } from "../../../../i18n";
import { toast } from "../../../Toast";
import {
  btnStyle,
  h3Style,
  hintStyle,
  inputStyle,
  lblStyle,
  sectionStyle,
} from "../../styles";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function WeatherSection({ settings, refresh }: Props) {
  useLocale();
  const [keyInput, setKeyInput] = useState("");
  const [city, setCity] = useState(settings?.weather_default_city ?? "");
  const provider = settings?.weather_provider ?? "openmeteo";
  const useIp = settings?.weather_use_ip ?? true;
  const units = settings?.weather_units ?? "metric";
  const hasKey = settings?.has_weather_api_key ?? false;

  useEffect(() => {
    setCity(settings?.weather_default_city ?? "");
  }, [settings?.weather_default_city]);

  return (
    <section style={sectionStyle}>
      <h3 style={h3Style}>🌤️ {t("weather.title")}</h3>
      <p style={hintStyle}>{t("weather.hint")}</p>
      <label style={lblStyle}>{t("weather.provider")}</label>
      <select
        value={provider}
        onChange={async (e) => {
          await setWeatherProvider(
            e.target.value as "openmeteo" | "openweathermap",
          );
          await refresh();
        }}
        style={inputStyle}
      >
        <option value="openmeteo">{t("weather.provider.openmeteo")}</option>
        <option value="openweathermap">{t("weather.provider.owm")}</option>
      </select>
      {provider === "openweathermap" && (
        <>
          <label style={lblStyle}>
            {t("weather.api_key")} {hasKey ? "✓" : "—"}
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="password"
              placeholder={
                hasKey
                  ? t("weather.api_key.placeholder_saved")
                  : t("weather.api_key.placeholder_empty")
              }
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={async () => {
                if (!keyInput.trim()) return;
                try {
                  await setWeatherApiKey(keyInput.trim());
                  setKeyInput("");
                  await refresh();
                  toast.success(t("settings.status.saved"));
                } catch (err) {
                  toast.error(String(err));
                }
              }}
              style={btnStyle}
            >
              {t("common.save")}
            </button>
            {hasKey && (
              <button
                onClick={async () => {
                  await clearWeatherApiKey();
                  await refresh();
                }}
                style={btnStyle}
              >
                {t("common.clear")}
              </button>
            )}
          </div>
        </>
      )}
      <label style={lblStyle}>{t("weather.default_city")}</label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          placeholder={t("weather.default_city.placeholder")}
          value={city}
          onChange={(e) => setCity(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={async () => {
            try {
              await setWeatherDefaultCity(city);
              await refresh();
              toast.success(t("settings.status.saved"));
            } catch (err) {
              toast.error(String(err));
            }
          }}
          style={btnStyle}
        >
          {t("common.save")}
        </button>
      </div>
      <label
        style={{
          ...lblStyle,
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
        }}
      >
        <input
          type="checkbox"
          checked={useIp}
          onChange={async (e) => {
            await setWeatherUseIp(e.target.checked);
            await refresh();
          }}
        />
        <span>{t("weather.use_ip")}</span>
      </label>
      <label style={lblStyle}>{t("weather.units")}</label>
      <select
        value={units}
        onChange={async (e) => {
          await setWeatherUnits(e.target.value as "metric" | "imperial");
          await refresh();
        }}
        style={inputStyle}
      >
        <option value="metric">{t("weather.units.metric")}</option>
        <option value="imperial">{t("weather.units.imperial")}</option>
      </select>
    </section>
  );
}
