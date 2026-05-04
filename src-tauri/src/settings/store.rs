//! Low-level store access used by every settings submodule.
//!
//! The persistence backend is `tauri-plugin-store` — a JSON file in
//! the app's data directory. Phase 1's storage choice is "encrypted
//! only by OS file permissions"; the upgrade path to OS keyring is
//! Phase 3 hardening.
//!
//! These helpers are deliberately tiny and untyped; each domain
//! submodule wraps them with a typed getter/setter pair.

use super::Result;
use tauri::{AppHandle, Runtime, Wry};
use tauri_plugin_store::StoreExt;

pub const STORE_FILE: &str = "settings.json";

pub fn read_string(app: &AppHandle<Wry>, key: &str) -> Option<String> {
    let store = app.store(STORE_FILE).ok()?;
    store.get(key).and_then(|v| v.as_str().map(str::to_string))
}

pub fn get_f64(app: &AppHandle<Wry>, key: &str) -> Option<f64> {
    let store = app.store(STORE_FILE).ok()?;
    store.get(key).and_then(|v| v.as_f64())
}

pub fn get_i64(app: &AppHandle<Wry>, key: &str) -> Option<i64> {
    let store = app.store(STORE_FILE).ok()?;
    store.get(key).and_then(|v| v.as_i64())
}

pub fn get_bool(app: &AppHandle<Wry>, key: &str, default: bool) -> bool {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(key))
        .and_then(|v| v.as_bool())
        .unwrap_or(default)
}

/// Writes `value` if non-empty, otherwise deletes the key. The
/// "empty-string deletes" convention is used uniformly so the frontend
/// can clear a field by sending `""` without a separate "clear" command.
pub fn write_optional_string<R: Runtime>(app: &AppHandle<R>, key: &str, value: &str) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    if value.trim().is_empty() {
        store.delete(key);
    } else {
        store.set(key, serde_json::Value::String(value.to_string()));
    }
    store.save()?;
    Ok(())
}

pub fn write_optional_f64<R: Runtime>(
    app: &AppHandle<R>,
    key: &str,
    value: Option<f64>,
) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    match value {
        Some(n) if n.is_finite() => store.set(key, serde_json::Value::from(n)),
        _ => {
            store.delete(key);
        }
    }
    store.save()?;
    Ok(())
}

pub fn write_i64<R: Runtime>(app: &AppHandle<R>, key: &str, value: i64) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(key, serde_json::Value::from(value));
    store.save()?;
    Ok(())
}

pub fn write_bool<R: Runtime>(app: &AppHandle<R>, key: &str, value: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(key, serde_json::Value::Bool(value));
    store.save()?;
    Ok(())
}

/// Writes a non-empty trimmed string, deleting the key when blank.
/// Used by API-key style fields where surrounding whitespace must be
/// stripped (users routinely paste with newlines).
pub fn write_secret<R: Runtime>(app: &AppHandle<R>, key: &str, value: &str) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        store.delete(key);
    } else {
        store.set(key, serde_json::Value::String(trimmed.to_string()));
    }
    store.save()?;
    Ok(())
}

pub fn delete_key<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.delete(key);
    store.save()?;
    Ok(())
}

pub fn get_raw(app: &AppHandle<Wry>, key: &str) -> Option<serde_json::Value> {
    let store = app.store(STORE_FILE).ok()?;
    store.get(key)
}

pub fn set_raw<R: Runtime>(app: &AppHandle<R>, key: &str, value: serde_json::Value) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(key, value);
    store.save()?;
    Ok(())
}
