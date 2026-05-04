//! Weather provider settings + helper to assemble a
//! [`komorebi_weather::WeatherConfig`] for the weather skill.

use super::api_keys::get_weather_api_key;
use super::defaults::{DEFAULT_WEATHER_PROVIDER, DEFAULT_WEATHER_UNITS};
use super::store::{get_bool, read_string, write_bool, write_optional_string};
use super::Result;
use tauri::{AppHandle, Runtime, Wry};

const KEY_WEATHER_PROVIDER: &str = "weather_provider";
const KEY_WEATHER_DEFAULT_CITY: &str = "weather_default_city";
const KEY_WEATHER_USE_IP: &str = "weather_use_ip";
const KEY_WEATHER_UNITS: &str = "weather_units";

pub fn get_weather_provider(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_WEATHER_PROVIDER).unwrap_or_else(|| DEFAULT_WEATHER_PROVIDER.to_string())
}
pub fn set_weather_provider<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    let normalized = match v.trim().to_lowercase().as_str() {
        "openweathermap" | "owm" => "openweathermap",
        _ => "openmeteo",
    };
    write_optional_string(app, KEY_WEATHER_PROVIDER, normalized)
}

pub fn get_weather_default_city(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_WEATHER_DEFAULT_CITY)
}
pub fn set_weather_default_city<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_WEATHER_DEFAULT_CITY, v)
}

pub fn get_weather_use_ip(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_WEATHER_USE_IP, true)
}
pub fn set_weather_use_ip<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_WEATHER_USE_IP, on)
}

pub fn get_weather_units(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_WEATHER_UNITS).unwrap_or_else(|| DEFAULT_WEATHER_UNITS.to_string())
}
pub fn set_weather_units<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    let normalized = match v.trim().to_lowercase().as_str() {
        "imperial" | "f" | "fahrenheit" => "imperial",
        _ => "metric",
    };
    write_optional_string(app, KEY_WEATHER_UNITS, normalized)
}

/// Build a [`komorebi_weather::WeatherConfig`] from the persisted settings.
pub fn weather_config(app: &AppHandle<Wry>) -> komorebi_weather::WeatherConfig {
    komorebi_weather::WeatherConfig {
        provider: Some(komorebi_weather::Provider::parse(&get_weather_provider(
            app,
        ))),
        api_key: get_weather_api_key(app),
        default_city: get_weather_default_city(app),
        use_ip: get_weather_use_ip(app),
        units: Some(komorebi_weather::Units::parse(&get_weather_units(app))),
    }
}
