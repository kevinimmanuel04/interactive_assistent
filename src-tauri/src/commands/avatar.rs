//! Avatar appearance commands (Live2D model, zoom, on-screen offset).

use crate::settings;
use tauri::{AppHandle, Wry};

#[tauri::command]
pub fn set_avatar_zoom(app: AppHandle<Wry>, value: f64) -> Result<(), String> {
    settings::set_avatar_zoom(&app, value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_avatar_offset(app: AppHandle<Wry>, offset_x: f64, offset_y: f64) -> Result<(), String> {
    settings::set_avatar_offset_x(&app, offset_x).map_err(|e| e.to_string())?;
    settings::set_avatar_offset_y(&app, offset_y).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_live2d_model(app: AppHandle<Wry>, url: String) -> Result<(), String> {
    settings::set_live2d_model_url(&app, &url).map_err(|e| e.to_string())
}
