//! Phase 2 stub: local LoRA training settings.
//!
//! The trainer itself ships in v1.8 — these toggles surface the schedule
//! and resource caps in the UI today.

use crate::settings;
use tauri::{AppHandle, Wry};

#[tauri::command]
pub fn set_training_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_training_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_training_max_cpu_pct(app: AppHandle<Wry>, pct: i64) -> Result<(), String> {
    settings::set_training_max_cpu_pct(&app, pct).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_training_battery_floor_pct(app: AppHandle<Wry>, pct: i64) -> Result<(), String> {
    settings::set_training_battery_floor_pct(&app, pct).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_training_min_examples(app: AppHandle<Wry>, n: i64) -> Result<(), String> {
    settings::set_training_min_examples(&app, n).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_training_schedule(app: AppHandle<Wry>, schedule: String) -> Result<(), String> {
    settings::set_training_schedule(&app, &schedule).map_err(|e| e.to_string())
}
