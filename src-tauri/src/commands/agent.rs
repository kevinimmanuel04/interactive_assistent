//! Agent / desktop-automation toggles.

use crate::settings;
use tauri::{AppHandle, Wry};

#[tauri::command]
pub fn set_proactive_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_proactive_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_desktop_automation_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_desktop_automation_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_auto_screen_watch_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_auto_screen_watch_enabled(&app, enabled).map_err(|e| e.to_string())
}
