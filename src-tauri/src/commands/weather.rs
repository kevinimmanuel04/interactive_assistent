//! Weather commands.

use crate::settings;
use tauri::{AppHandle, Emitter, Wry};

#[tauri::command]
pub async fn get_weather(
    app: AppHandle<Wry>,
    city: Option<String>,
) -> Result<komorebi_weather::WeatherReport, String> {
    let report = crate::weather::fetch(&app, city).await?;
    let _ = app.emit("weather:result", &report);
    Ok(report)
}

#[tauri::command]
pub fn set_weather_provider(app: AppHandle<Wry>, provider: String) -> Result<(), String> {
    settings::set_weather_provider(&app, &provider).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_weather_api_key(app: AppHandle<Wry>, key: String) -> Result<(), String> {
    settings::set_weather_api_key(&app, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_weather_api_key(app: AppHandle<Wry>) -> Result<(), String> {
    settings::set_weather_api_key(&app, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_weather_default_city(app: AppHandle<Wry>, city: String) -> Result<(), String> {
    settings::set_weather_default_city(&app, &city).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_weather_use_ip(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_weather_use_ip(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_weather_units(app: AppHandle<Wry>, units: String) -> Result<(), String> {
    settings::set_weather_units(&app, &units).map_err(|e| e.to_string())
}
