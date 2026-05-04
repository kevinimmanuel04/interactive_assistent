//! Phase 1: feedback telemetry commands.

use crate::settings;
use tauri::{AppHandle, Wry};

#[derive(serde::Serialize)]
pub struct FeedbackStatsDto {
    pub pending: i64,
    pub uploaded: i64,
    pub telemetry_enabled: bool,
    pub anon_token: Option<String>,
}

#[tauri::command]
pub fn feedback_record(
    app: AppHandle<Wry>,
    model_label: String,
    route: String,
    prompt: String,
    response: String,
    rating: i32,
    lang: String,
) -> Result<i64, String> {
    crate::feedback::record(
        &app,
        &model_label,
        &route,
        &prompt,
        &response,
        rating,
        &lang,
    )
}

#[tauri::command]
pub fn feedback_stats(app: AppHandle<Wry>) -> Result<FeedbackStatsDto, String> {
    let s = crate::feedback::stats(&app)?;
    Ok(FeedbackStatsDto {
        pending: s.pending,
        uploaded: s.uploaded,
        telemetry_enabled: settings::get_telemetry_enabled(&app),
        anon_token: settings::get_anon_token(&app),
    })
}

#[tauri::command]
pub fn feedback_purge(app: AppHandle<Wry>) -> Result<i64, String> {
    let n = crate::feedback::purge(&app)?;
    // Rotate the anonymous token alongside a purge so the user gets a
    // clean slate (the previous token can no longer be linked to any
    // future contributions).
    let _ = settings::rotate_anon_token(&app);
    Ok(n)
}

#[tauri::command]
pub fn set_telemetry_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_telemetry_enabled(&app, enabled).map_err(|e| e.to_string())?;
    if enabled {
        // Ensure a token exists so the first upload doesn't have to wait.
        let _ = settings::ensure_anon_token(&app);
    }
    Ok(())
}

#[tauri::command]
pub fn set_telemetry_endpoint(app: AppHandle<Wry>, url: String) -> Result<(), String> {
    settings::set_telemetry_endpoint(&app, &url).map_err(|e| e.to_string())
}
