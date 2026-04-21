//! Tauri command surface.

use crate::{chat::ChatService, models, settings};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State, Wry};

#[tauri::command]
pub fn get_settings(app: AppHandle<Wry>) -> settings::PublicSettings {
    settings::public_snapshot(&app)
}

#[tauri::command]
pub fn set_openrouter_key(app: AppHandle<Wry>, key: String) -> Result<(), String> {
    settings::set_openrouter_key(&app, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_mode(app: AppHandle<Wry>, mode: String) -> Result<(), String> {
    let m = match mode.as_str() {
        "auto" => komorebi_router::Mode::Auto,
        "local" => komorebi_router::Mode::Local,
        "cloud" => komorebi_router::Mode::Cloud,
        other => return Err(format!("unknown mode: {other}")),
    };
    settings::set_mode(&app, m).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn send_message(app: AppHandle<Wry>, prompt: String) -> Result<String, String> {
    let prompt = prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("empty prompt".into());
    }
    let id = uuid_like();
    crate::chat::spawn_generation(app, id.clone(), prompt);
    Ok(id)
}

#[tauri::command]
pub async fn cancel_generation(service: State<'_, Arc<ChatService>>) -> Result<(), String> {
    service.cancel();
    Ok(())
}

#[tauri::command]
pub async fn reset_chat(service: State<'_, Arc<ChatService>>) -> Result<(), String> {
    service.clear().await;
    Ok(())
}

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

#[tauri::command]
pub fn set_local_model(app: AppHandle<Wry>, asset_id: String) -> Result<(), String> {
    let asset = models::find(&asset_id).ok_or_else(|| format!("unknown asset: {asset_id}"))?;
    let path = models::asset_path(&app, &asset)?;
    if !path.exists() {
        return Err("asset is not downloaded yet".into());
    }
    settings::set_local_model_path(&app, path.to_string_lossy().as_ref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_piper_binary(app: AppHandle<Wry>, path: String) -> Result<(), String> {
    settings::set_piper_binary(&app, &path).map_err(|e| e.to_string())?;
    reload_tts(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn set_piper_voice(app: AppHandle<Wry>, path: String) -> Result<(), String> {
    settings::set_piper_voice(&app, &path).map_err(|e| e.to_string())?;
    reload_tts(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn set_tts_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_tts_enabled(&app, enabled).map_err(|e| e.to_string())?;
    reload_tts(&app).await;
    Ok(())
}

#[tauri::command]
pub fn set_live2d_model(app: AppHandle<Wry>, url: String) -> Result<(), String> {
    settings::set_live2d_model_url(&app, &url).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn speak_text(
    tts: State<'_, komorebi_voice::tts::PiperTts>,
    text: String,
) -> Result<(), String> {
    if text.trim().is_empty() {
        return Ok(());
    }
    tts.speak(&text).await.map_err(|e| e.to_string())
}

/// Re-reads persisted TTS settings and applies them to the shared handle.
/// Called on startup and whenever any TTS-related setting changes.
pub async fn reload_tts(app: &AppHandle<Wry>) {
    use komorebi_voice::tts::{PiperConfig, PiperTts};
    let Some(tts) = app.try_state::<PiperTts>() else {
        return;
    };
    let enabled = settings::get_tts_enabled(app);
    let bin = settings::get_piper_binary(app);
    let voice = settings::get_piper_voice(app);
    let cfg = match (enabled, bin, voice) {
        (true, Some(b), Some(v)) if !b.is_empty() && !v.is_empty() => {
            Some(PiperConfig::from_voice(b, v))
        }
        _ => None,
    };
    tts.inner().configure(cfg).await;
}

/// Lightweight id generator (avoids pulling in the `uuid` crate just for UX).
fn uuid_like() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("msg-{nanos:x}")
}
