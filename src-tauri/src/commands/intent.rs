//! Local intent classifier — Tauri commands.

use std::sync::Arc;
use tauri::{AppHandle, Manager, Wry};

use crate::intent::IntentState;

/// `true` once the embedding model is loaded in memory and ready.
#[tauri::command]
pub async fn intent_status(app: AppHandle<Wry>) -> bool {
    let Some(state) = app.try_state::<Arc<IntentState>>() else {
        return false;
    };
    state.is_loaded().await
}

/// Trigger a one-time load of the embedding model. On first ever call
/// this downloads ~120 MB from Hugging Face into the app data dir; the
/// promise only resolves once the model is fully usable. Subsequent
/// calls are cheap no-ops.
#[tauri::command]
pub async fn intent_load(app: AppHandle<Wry>) -> Result<(), String> {
    let state = app
        .try_state::<Arc<IntentState>>()
        .ok_or_else(|| "intent state not initialized".to_string())?
        .inner()
        .clone();
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("intent");
    state.load(cache_dir).await
}

/// Debug command: classify a string and return ranked intent scores.
/// Returns an error if the model isn't loaded yet.
#[tauri::command]
pub async fn intent_classify_debug(
    app: AppHandle<Wry>,
    query: String,
) -> Result<Vec<komorebi_intent::IntentMatch>, String> {
    let state = app
        .try_state::<Arc<IntentState>>()
        .ok_or_else(|| "intent state not initialized".to_string())?
        .inner()
        .clone();
    let engine = state
        .engine()
        .await
        .ok_or_else(|| "intent model not loaded; call intent_load first".to_string())?;
    tokio::task::spawn_blocking(move || engine.classify(&query).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}
