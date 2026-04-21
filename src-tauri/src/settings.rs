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
const KEY_TTS_ENABLED: &str = "tts_enabled";
const KEY_PIPER_BINARY: &str = "piper_binary_path";
const KEY_PIPER_VOICE: &str = "piper_voice_path";
const KEY_LIVE2D_MODEL_URL: &str = "live2d_model_url";
const KEY_WHISPER_MODEL_PATH: &str = "whisper_model_path";
const KEY_WAKE_WORD: &str = "wake_word";
const KEY_LISTEN_ENABLED: &str = "listen_enabled";
const KEY_SMART_ROUTING: &str = "smart_routing";
const KEY_CLASSIFIER_MODEL: &str = "classifier_model";
const KEY_RAG_ENABLED: &str = "rag_enabled";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicSettings {
    pub has_openrouter_key: bool,
    pub openrouter_model: String,
    pub mode: String,
    pub local_model_path: Option<String>,
    pub tts_enabled: bool,
    pub piper_binary_path: Option<String>,
    pub piper_voice_path: Option<String>,
    pub live2d_model_url: Option<String>,
    pub whisper_model_path: Option<String>,
    pub stt_available: bool,
    pub wake_word: Option<String>,
    pub listen_enabled: bool,
    pub smart_routing: bool,
    pub classifier_model: String,
    pub rag_enabled: bool,
}

pub fn get_openrouter_key(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_OPENROUTER_API)
}

pub fn set_openrouter_key<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    if key.trim().is_empty() {
        store.delete(KEY_OPENROUTER_API);
    } else {
        store.set(
            KEY_OPENROUTER_API,
            serde_json::Value::String(key.to_string()),
        );
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

#[allow(dead_code)] // used by chat::stream_local when the `local-llm` feature is on
pub fn get_local_model_path(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_LOCAL_MODEL_PATH)
}

pub fn set_local_model_path<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    if path.trim().is_empty() {
        store.delete(KEY_LOCAL_MODEL_PATH);
    } else {
        store.set(
            KEY_LOCAL_MODEL_PATH,
            serde_json::Value::String(path.to_string()),
        );
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
        tts_enabled: get_tts_enabled(app),
        piper_binary_path: read_string(app, KEY_PIPER_BINARY),
        piper_voice_path: read_string(app, KEY_PIPER_VOICE),
        live2d_model_url: read_string(app, KEY_LIVE2D_MODEL_URL),
        whisper_model_path: read_string(app, KEY_WHISPER_MODEL_PATH),
        stt_available: komorebi_voice::stt::is_available(),
        wake_word: read_string(app, KEY_WAKE_WORD),
        listen_enabled: get_listen_enabled(app),
        smart_routing: get_smart_routing(app),
        classifier_model: get_classifier_model(app),
        rag_enabled: get_rag_enabled(app),
    }
}

pub fn get_whisper_model_path(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_WHISPER_MODEL_PATH)
}

pub fn set_whisper_model_path<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<()> {
    write_optional_string(app, KEY_WHISPER_MODEL_PATH, path)
}

pub fn set_wake_word<R: Runtime>(app: &AppHandle<R>, phrase: &str) -> Result<()> {
    write_optional_string(app, KEY_WAKE_WORD, phrase)
}

pub fn get_listen_enabled(app: &AppHandle<Wry>) -> bool {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(KEY_LISTEN_ENABLED))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub fn set_listen_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_LISTEN_ENABLED, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
}

pub fn get_smart_routing(app: &AppHandle<Wry>) -> bool {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(KEY_SMART_ROUTING))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub fn set_smart_routing<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_SMART_ROUTING, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
}

pub fn get_classifier_model(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_CLASSIFIER_MODEL)
        .unwrap_or_else(|| komorebi_cloud::DEFAULT_CLASSIFIER_MODEL.to_string())
}

pub fn set_classifier_model<R: Runtime>(app: &AppHandle<R>, model: &str) -> Result<()> {
    write_optional_string(app, KEY_CLASSIFIER_MODEL, model)
}

pub fn get_rag_enabled(app: &AppHandle<Wry>) -> bool {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(KEY_RAG_ENABLED))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub fn set_rag_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_RAG_ENABLED, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
}

pub fn get_tts_enabled(app: &AppHandle<Wry>) -> bool {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(KEY_TTS_ENABLED))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub fn set_tts_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_TTS_ENABLED, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
}

pub fn get_piper_binary(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_PIPER_BINARY)
}

pub fn set_piper_binary<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<()> {
    write_optional_string(app, KEY_PIPER_BINARY, path)
}

pub fn get_piper_voice(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_PIPER_VOICE)
}

pub fn set_piper_voice<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<()> {
    write_optional_string(app, KEY_PIPER_VOICE, path)
}

pub fn set_live2d_model_url<R: Runtime>(app: &AppHandle<R>, url: &str) -> Result<()> {
    write_optional_string(app, KEY_LIVE2D_MODEL_URL, url)
}

fn write_optional_string<R: Runtime>(app: &AppHandle<R>, key: &str, value: &str) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    if value.trim().is_empty() {
        store.delete(key);
    } else {
        store.set(key, serde_json::Value::String(value.to_string()));
    }
    store.save()?;
    Ok(())
}

fn read_string(app: &AppHandle<Wry>, key: &str) -> Option<String> {
    let store = app.store(STORE_FILE).ok()?;
    store.get(key).and_then(|v| v.as_str().map(str::to_string))
}
