//! Relationship layer + user identity / language commands.

use crate::settings;
use tauri::{AppHandle, Wry};

#[tauri::command]
pub fn get_relationship_state(app: AppHandle<Wry>) -> crate::relationship::State {
    crate::relationship::load(&app)
}

#[tauri::command]
pub fn reset_relationship(app: AppHandle<Wry>) -> Result<(), String> {
    crate::relationship::reset(&app);
    Ok(())
}

#[tauri::command]
pub fn set_user_name(app: AppHandle<Wry>, name: String) -> Result<(), String> {
    settings::set_user_name(&app, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_relationship_visibility(app: AppHandle<Wry>, visibility: String) -> Result<(), String> {
    settings::set_relationship_visibility(&app, &visibility).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_relationship_nsfw_allowed(app: AppHandle<Wry>, allowed: bool) -> Result<(), String> {
    settings::set_relationship_nsfw_allowed(&app, allowed).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_relationship_decay_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_relationship_decay_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_language(app: AppHandle<Wry>, language: String) -> Result<(), String> {
    settings::set_language(&app, &language).map_err(|e| e.to_string())
}

/// Returns the *resolved* language code (`en`, `ru`, or `uk`).
/// Use this on the frontend to bootstrap the i18n layer when the user
/// preference is "auto" — the backend reads the OS locale.
#[tauri::command]
pub fn get_resolved_language(app: AppHandle<Wry>) -> String {
    settings::resolve_language(&app).to_string()
}
