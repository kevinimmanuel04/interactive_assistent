//! Tauri-side glue around `komorebi-weather`.
//!
//! Exposes:
//! * [`maybe_handle`] — pre-check used by the chat pipeline. If the user
//!   prompt is a weather query, fetches the forecast and returns the reply
//!   text; otherwise returns `Ok(None)` and the normal pipeline continues.
//! * [`fetch`]        — direct query path used by the `get_weather` Tauri
//!   command.

use tauri::{AppHandle, Emitter, Wry};

use crate::settings;
use komorebi_weather::{
    extract_city_from_text, fetch as wfetch, format_report, is_weather_query, WeatherReport,
};

/// Run a weather query for `city` (or auto-resolve via settings/IP).
/// Persists nothing; emits no events on its own — caller decides.
pub async fn fetch(app: &AppHandle<Wry>, city: Option<String>) -> Result<WeatherReport, String> {
    let cfg = settings::weather_config(app);
    wfetch(&cfg, city.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// If `prompt` looks like a weather question, fetch + format + return the
/// reply text. Returns `None` otherwise. Side-effect-free except for the
/// network call.
pub async fn maybe_handle(app: &AppHandle<Wry>, prompt: &str) -> Option<String> {
    if !is_weather_query(prompt) {
        return None;
    }
    let city = extract_city_from_text(prompt);
    let cfg = settings::weather_config(app);
    match wfetch(&cfg, city.as_deref()).await {
        Ok(rep) => {
            let _ = app.emit("weather:result", &rep);
            Some(format_report(&rep))
        }
        Err(e) => {
            let msg = format!("Не удалось получить погоду: {e}");
            tracing::warn!(?e, "weather fetch failed");
            Some(msg)
        }
    }
}
