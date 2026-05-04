//! Asset / model catalog commands (download, delete, activate).

use crate::{models, settings};
use tauri::{AppHandle, Wry};

#[tauri::command]
pub fn list_assets(app: AppHandle<Wry>) -> Vec<serde_json::Value> {
    let statuses = models::statuses(&app);
    models::catalog()
        .into_iter()
        .map(|a| {
            let st = statuses.iter().find(|s| s.id == a.id);
            serde_json::json!({
                "id": a.id,
                "kind": a.kind,
                "title": a.title,
                "description": a.description,
                "file_name": a.file_name,
                "approx_size_mb": a.approx_size_mb,
                "installed": st.map(|s| s.installed).unwrap_or(false),
                "path": st.and_then(|s| s.path.clone()),
            })
        })
        .collect()
}

#[tauri::command]
pub fn download_asset(app: AppHandle<Wry>, asset_id: String) -> Result<(), String> {
    let asset = models::find(&asset_id).ok_or_else(|| format!("unknown asset: {asset_id}"))?;
    models::spawn_download(app, asset);
    Ok(())
}

/// Deletes a downloaded asset from disk and clears it from the corresponding
/// active-model setting if that setting currently points at the deleted file.
/// Missing files are treated as success (idempotent).
#[tauri::command]
pub async fn delete_asset(app: AppHandle<Wry>, asset_id: String) -> Result<(), String> {
    let asset = models::find(&asset_id).ok_or_else(|| format!("unknown asset: {asset_id}"))?;
    let path = models::asset_path(&app, &asset)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    let path_str = path.to_string_lossy().to_string();
    use crate::models::AssetKind;
    match asset.kind {
        AssetKind::LlmGguf => {
            if settings::get_local_model_path(&app).as_deref() == Some(path_str.as_str()) {
                settings::set_local_model_path(&app, "").map_err(|e| e.to_string())?;
            }
        }
        AssetKind::PiperVoice => {
            if settings::get_piper_voice(&app).as_deref() == Some(path_str.as_str()) {
                settings::set_piper_voice(&app, "").map_err(|e| e.to_string())?;
                super::tts::reload_tts(&app).await;
            }
        }
        AssetKind::WhisperGgml => {
            if settings::get_whisper_model_path(&app).as_deref() == Some(path_str.as_str()) {
                settings::set_whisper_model_path(&app, "").map_err(|e| e.to_string())?;
            }
        }
        AssetKind::PiperConfig => { /* no active-setting; config auto-pairs with voice */ }
    }
    Ok(())
}

#[tauri::command]
pub fn set_local_model(app: AppHandle<Wry>, asset_id: String) -> Result<(), String> {
    let asset = models::find(&asset_id).ok_or_else(|| format!("unknown asset: {asset_id}"))?;
    let path = models::asset_path(&app, &asset)?;
    if !path.exists() {
        return Err("asset is not downloaded yet".into());
    }
    settings::set_local_model_path(&app, path.to_string_lossy().as_ref()).map_err(|e| e.to_string())
}

/// Pin a separate (typically smaller) GGUF as the dedicated skill
/// classifier. When unset, the classifier reuses the chat model.
/// Tracked by [proposal 0001](../../docs/proposals/0001-smart-routing-local-fallback.md).
#[tauri::command]
pub fn set_local_classifier_model(app: AppHandle<Wry>, asset_id: String) -> Result<(), String> {
    let asset = models::find(&asset_id).ok_or_else(|| format!("unknown asset: {asset_id}"))?;
    let path = models::asset_path(&app, &asset)?;
    if !path.exists() {
        return Err("asset is not downloaded yet".into());
    }
    settings::set_local_classifier_model_path(&app, path.to_string_lossy().as_ref())
        .map_err(|e| e.to_string())
}

/// Clear the dedicated classifier model, falling back to the chat model.
#[tauri::command]
pub fn clear_local_classifier_model(app: AppHandle<Wry>) -> Result<(), String> {
    settings::set_local_classifier_model_path(&app, "").map_err(|e| e.to_string())
}
