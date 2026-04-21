//! Settings persistence via `tauri-plugin-store`.
//!
//! Phase 1 storage choice: the API key lives in a JSON store encrypted only
//! by the OS file permissions on the app-data dir. Upgrade path to OS keyring
//! is planned for Phase 3 hardening.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime, Wry};
use tauri_plugin_store::StoreExt;

type Result<T> = anyhow::Result<T>;

const STORE_FILE: &str = "settings.json";
const KEY_OPENROUTER_API: &str = "openrouter_api_key";
const KEY_OPENROUTER_MODEL: &str = "openrouter_model";
const KEY_MODE: &str = "mode";
const KEY_LOCAL_MODEL_PATH: &str = "local_model_path";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicSettings {
    pub has_openrouter_key: bool,
    pub openrouter_model: String,
    pub mode: String,
    pub local_model_path: Option<String>,
}

pub fn get_openrouter_key(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_OPENROUTER_API)
}

pub fn set_openrouter_key<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    if key.trim().is_empty() {
        store.delete(KEY_OPENROUTER_API);
    } else {
        store.set(KEY_OPENROUTER_API, serde_json::Value::String(key.to_string()));
    }
    store.save()?;
    Ok(())
}

pub fn get_openrouter_model(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_OPENROUTER_MODEL)
        .unwrap_or_else(|| komorebi_cloud::DEFAULT_MODEL.to_string())
}

pub fn get_mode(app: &AppHandle<Wry>) -> komorebi_router::Mode {
    match read_string(app, KEY_MODE).as_deref() {
        Some("local") => komorebi_router::Mode::Local,
        Some("cloud") => komorebi_router::Mode::Cloud,
        _ => komorebi_router::Mode::Auto,
    }
}

pub fn set_mode<R: Runtime>(app: &AppHandle<R>, mode: komorebi_router::Mode) -> Result<()> {
    let v = match mode {
        komorebi_router::Mode::Auto => "auto",
        komorebi_router::Mode::Local => "local",
        komorebi_router::Mode::Cloud => "cloud",
    };
    let store = app.store(STORE_FILE)?;
    store.set(KEY_MODE, serde_json::Value::String(v.into()));
    store.save()?;
    Ok(())
}

#[allow(dead_code)] // consumed by local-llm feature in Phase 1B.3
pub fn get_local_model_path(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_LOCAL_MODEL_PATH)
}

pub fn set_local_model_path<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    if path.trim().is_empty() {
        store.delete(KEY_LOCAL_MODEL_PATH);
    } else {
        store.set(KEY_LOCAL_MODEL_PATH, serde_json::Value::String(path.to_string()));
    }
    store.save()?;
    Ok(())
}

pub fn public_snapshot(app: &AppHandle<Wry>) -> PublicSettings {
    PublicSettings {
        has_openrouter_key: get_openrouter_key(app).is_some(),
        openrouter_model: get_openrouter_model(app),
        mode: match get_mode(app) {
            komorebi_router::Mode::Auto => "auto",
            komorebi_router::Mode::Local => "local",
            komorebi_router::Mode::Cloud => "cloud",
        }
        .to_string(),
        local_model_path: read_string(app, KEY_LOCAL_MODEL_PATH),
    }
}

fn read_string(app: &AppHandle<Wry>, key: &str) -> Option<String> {
    let store = app.store(STORE_FILE).ok()?;
    store.get(key).and_then(|v| v.as_str().map(str::to_string))
}
