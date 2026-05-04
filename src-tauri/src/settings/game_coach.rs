//! Game Coach mode settings. The actual coach loop lives in
//! [`crate::coach`]; this module just persists the user's choices.
//!
//! See [proposal 0002](../../../docs/proposals/0002-game-coach-text-vision-split.md)
//! for the rationale behind `use_vision`.

use super::defaults::DEFAULT_GAME_COACH_MODEL;
use super::store::{get_bool, read_string, write_bool, write_optional_string};
use super::Result;
use tauri::{AppHandle, Runtime, Wry};

const KEY_GAME_COACH_ENABLED: &str = "game_coach_enabled";
const KEY_GAME_COACH_MODEL: &str = "game_coach_model";
/// Whether the coach captures the screen and sends it to a vision
/// model. When `false`, the coach falls back to a text-only path that
/// only sees window title + process name, and can run on a local LLM.
const KEY_GAME_COACH_USE_VISION: &str = "game_coach_use_vision";

pub fn get_game_coach_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_GAME_COACH_ENABLED, false)
}
pub fn set_game_coach_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_GAME_COACH_ENABLED, on)
}

pub fn get_game_coach_model(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_GAME_COACH_MODEL).unwrap_or_else(|| DEFAULT_GAME_COACH_MODEL.to_string())
}
pub fn set_game_coach_model<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_GAME_COACH_MODEL, v)
}

/// Default `true` preserves the v1.7 behavior for users upgrading; the
/// frontend exposes the toggle so local-first users can flip it to
/// `false` and run the coach on their local LLM with no screenshot.
pub fn get_game_coach_use_vision(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_GAME_COACH_USE_VISION, true)
}
pub fn set_game_coach_use_vision<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_GAME_COACH_USE_VISION, on)
}
