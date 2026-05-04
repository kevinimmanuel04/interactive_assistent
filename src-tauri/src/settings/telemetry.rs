//! Phase 1: feedback telemetry (👍/👎).
//!
//! The anonymous install token is **not** an identifier — it exists so
//! the server can rate-limit per install without seeing IPs (which it
//! shouldn't store either). It rotates whenever the user purges
//! feedback history.

use super::defaults::DEFAULT_TELEMETRY_ENDPOINT;
use super::store::{get_bool, read_string, write_bool, write_optional_string, STORE_FILE};
use super::Result;
use tauri::{AppHandle, Runtime, Wry};
use tauri_plugin_store::StoreExt;

const KEY_TELEMETRY_ENABLED: &str = "telemetry_enabled";
const KEY_TELEMETRY_ENDPOINT: &str = "telemetry_endpoint";
const KEY_ANON_TOKEN: &str = "telemetry_anon_token";

pub fn get_telemetry_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_TELEMETRY_ENABLED, false)
}

pub fn set_telemetry_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_TELEMETRY_ENABLED, on)
}

pub fn get_telemetry_endpoint(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_TELEMETRY_ENDPOINT)
        .unwrap_or_else(|| DEFAULT_TELEMETRY_ENDPOINT.to_string())
}

pub fn set_telemetry_endpoint<R: Runtime>(app: &AppHandle<R>, url: &str) -> Result<()> {
    write_optional_string(app, KEY_TELEMETRY_ENDPOINT, url)
}

/// Returns the persisted anonymous install token, or `None` if it
/// hasn't been generated yet. Use [`ensure_anon_token`] to create one
/// lazily on first telemetry submission.
pub fn get_anon_token(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_ANON_TOKEN)
}

pub fn ensure_anon_token<R: Runtime>(app: &AppHandle<R>) -> Result<String> {
    let store = app.store(STORE_FILE)?;
    if let Some(v) = store
        .get(KEY_ANON_TOKEN)
        .and_then(|v| v.as_str().map(String::from))
    {
        if !v.is_empty() {
            return Ok(v);
        }
    }
    let token = generate_anon_token();
    store.set(KEY_ANON_TOKEN, serde_json::Value::String(token.clone()));
    store.save()?;
    Ok(token)
}

pub fn rotate_anon_token<R: Runtime>(app: &AppHandle<R>) -> Result<String> {
    let store = app.store(STORE_FILE)?;
    let token = generate_anon_token();
    store.set(KEY_ANON_TOKEN, serde_json::Value::String(token.clone()));
    store.save()?;
    Ok(token)
}

fn generate_anon_token() -> String {
    use sha2::Digest;
    use std::time::{SystemTime, UNIX_EPOCH};
    // 128 bits of entropy is overkill for rate-limiting. To stay
    // dependency-free here, we hash high-resolution time + process id.
    // Not cryptographically required (server is free to ignore weak
    // tokens); just needs to be unique per install.
    let mut h = sha2::Sha256::new();
    sha2::Digest::update(
        &mut h,
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
            .to_le_bytes(),
    );
    sha2::Digest::update(&mut h, std::process::id().to_le_bytes());
    let bytes = sha2::Digest::finalize(h);
    let mut s = String::with_capacity(32);
    for b in bytes.iter().take(16) {
        s.push_str(&format!("{:02x}", b));
    }
    s
}
