import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { WeatherReport } from "./types";

export async function getWeather(city?: string): Promise<WeatherReport> {
  return invoke<WeatherReport>("get_weather", { city: city ?? null });
}

export async function setWeatherProvider(
  provider: "openmeteo" | "openweathermap",
): Promise<void> {
  await invoke("set_weather_provider", { provider });
}

export async function setWeatherApiKey(key: string): Promise<void> {
  await invoke("set_weather_api_key", { key });
}

export async function clearWeatherApiKey(): Promise<void> {
  await invoke("clear_weather_api_key");
}

export async function setWeatherDefaultCity(city: string): Promise<void> {
  await invoke("set_weather_default_city", { city });
}

export async function setWeatherUseIp(enabled: boolean): Promise<void> {
  await invoke("set_weather_use_ip", { enabled });
}

export async function setWeatherUnits(
  units: "metric" | "imperial",
): Promise<void> {
  await invoke("set_weather_units", { units });
}

export function onWeather(cb: (r: WeatherReport) => void): Promise<UnlistenFn> {
  return listen<WeatherReport>("weather:result", (evt) => cb(evt.payload));
}
