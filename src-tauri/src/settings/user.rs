//! User identity, language preference, and the relationship layer
//! (which gates flirty/NSFW response styles).

use super::defaults::{DEFAULT_LANGUAGE, DEFAULT_RELATIONSHIP_VISIBILITY};
use super::store::{
    delete_key, get_bool, get_raw, read_string, set_raw, write_bool, write_optional_string,
};
use super::Result;
use tauri::{AppHandle, Runtime, Wry};

const KEY_USER_NAME: &str = "user_name";
const KEY_RELATIONSHIP_STATE: &str = "relationship_state";
const KEY_RELATIONSHIP_VISIBILITY: &str = "relationship_visibility";
const KEY_RELATIONSHIP_NSFW_ALLOWED: &str = "relationship_nsfw_allowed";
const KEY_RELATIONSHIP_DECAY_ENABLED: &str = "relationship_decay_enabled";
const KEY_LANGUAGE: &str = "language";

// --- Identity -------------------------------------------------------------

pub fn get_user_name(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_USER_NAME)
}
pub fn set_user_name<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_USER_NAME, v)
}

// --- Relationship preferences --------------------------------------------

pub fn get_relationship_visibility(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_RELATIONSHIP_VISIBILITY)
        .unwrap_or_else(|| DEFAULT_RELATIONSHIP_VISIBILITY.to_string())
}
pub fn set_relationship_visibility<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    let normalized = match v.trim().to_lowercase().as_str() {
        "hidden" => "hidden",
        _ => "indicator",
    };
    write_optional_string(app, KEY_RELATIONSHIP_VISIBILITY, normalized)
}

pub fn get_relationship_nsfw_allowed(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_RELATIONSHIP_NSFW_ALLOWED, false)
}
pub fn set_relationship_nsfw_allowed<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_RELATIONSHIP_NSFW_ALLOWED, on)
}

pub fn get_relationship_decay_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_RELATIONSHIP_DECAY_ENABLED, true)
}
pub fn set_relationship_decay_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_RELATIONSHIP_DECAY_ENABLED, on)
}

// --- Relationship state blob ---------------------------------------------

/// Read the persisted relationship-state JSON blob (or `None` if absent).
pub fn read_relationship_state(app: &AppHandle<Wry>) -> Option<serde_json::Value> {
    get_raw(app, KEY_RELATIONSHIP_STATE)
}

/// Write the relationship-state JSON blob.
pub fn write_relationship_state<R: Runtime>(
    app: &AppHandle<R>,
    state: &serde_json::Value,
) -> Result<()> {
    set_raw(app, KEY_RELATIONSHIP_STATE, state.clone())
}

pub fn clear_relationship_state<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    delete_key(app, KEY_RELATIONSHIP_STATE)
}

// --- Language -------------------------------------------------------------

/// User-selected UI/assistant language. One of `auto`, `en`, `ru`, `uk`.
pub fn get_language(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_LANGUAGE).unwrap_or_else(|| DEFAULT_LANGUAGE.to_string())
}

pub fn set_language<R: Runtime>(app: &AppHandle<R>, lang: &str) -> Result<()> {
    let v = match lang {
        "auto" | "en" | "ru" | "uk" => lang,
        _ => "auto",
    };
    write_optional_string(app, KEY_LANGUAGE, v)
}

/// Resolves "auto" to a concrete language code based on OS locale.
/// Falls back to "en" when the locale is unknown or unsupported.
pub fn resolve_language(app: &AppHandle<Wry>) -> &'static str {
    let pref = get_language(app);
    if pref == "en" || pref == "ru" || pref == "uk" {
        return match pref.as_str() {
            "ru" => "ru",
            "uk" => "uk",
            _ => "en",
        };
    }
    // auto — sniff the OS locale.
    let locale = sys_locale::get_locale().unwrap_or_default().to_lowercase();
    if locale.starts_with("uk") {
        "uk"
    } else if locale.starts_with("ru") {
        "ru"
    } else {
        "en"
    }
}
