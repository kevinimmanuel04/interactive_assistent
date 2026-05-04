//! Agent / desktop-automation toggles. These gate features that can
//! act on the user's machine without confirmation, so defaults are
//! conservative (everything off except chat tool calls, which lives in
//! [`super::routing`]).

use super::store::{get_bool, read_string, write_bool, write_optional_string};
use super::Result;
use tauri::{AppHandle, Runtime, Wry};

const KEY_AGENT_WORKSPACE: &str = "agent_workspace";
const KEY_PROACTIVE_ENABLED: &str = "proactive_enabled";
const KEY_DESKTOP_AUTOMATION: &str = "desktop_automation_enabled";
const KEY_AUTO_SCREEN_WATCH: &str = "auto_screen_watch_enabled";

pub fn get_agent_workspace(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_AGENT_WORKSPACE)
}

pub fn set_agent_workspace<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<()> {
    write_optional_string(app, KEY_AGENT_WORKSPACE, path)
}

pub fn get_proactive_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_PROACTIVE_ENABLED, false)
}

pub fn set_proactive_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_PROACTIVE_ENABLED, on)
}

pub fn get_desktop_automation_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_DESKTOP_AUTOMATION, false)
}

pub fn set_desktop_automation_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_DESKTOP_AUTOMATION, on)
}

#[allow(dead_code)]
pub fn get_auto_screen_watch_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_AUTO_SCREEN_WATCH, false)
}

pub fn set_auto_screen_watch_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_AUTO_SCREEN_WATCH, on)
}
