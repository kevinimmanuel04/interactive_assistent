//! Game Coach toggles (text/vision split, see proposal 0002).

use crate::settings;
use tauri::{AppHandle, Wry};

#[tauri::command]
pub fn set_game_coach_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_game_coach_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_game_coach_model(app: AppHandle<Wry>, model: String) -> Result<(), String> {
    settings::set_game_coach_model(&app, &model).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_game_coach_use_vision(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_game_coach_use_vision(&app, enabled).map_err(|e| e.to_string())
}
