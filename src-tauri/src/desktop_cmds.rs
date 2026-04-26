//! Tauri command wrappers exposing `komorebi-desktop` to the frontend +
//! the LLM tool-use layer.

use crate::settings;
use komorebi_desktop::{capture, files, input, procs, vdesktop};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Wry};

fn workspace_root(app: &AppHandle<Wry>) -> Result<PathBuf, String> {
    // User-configurable (see settings); defaults to a Komorebi folder under
    // the OS Documents dir so the assistant has an explicitly scoped sandbox.
    if let Some(custom) = settings::get_agent_workspace(app) {
        let p = PathBuf::from(custom);
        if !p.exists() {
            std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
        }
        return Ok(p);
    }
    let base = dirs_docs().ok_or_else(|| "no documents directory".to_string())?;
    let dir = base.join("Komorebi");
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir)
}

fn dirs_docs() -> Option<PathBuf> {
    // Cross-platform documents dir without adding a dependency: fall back
    // to USERPROFILE/Documents on Windows, $HOME/Documents elsewhere.
    if cfg!(windows) {
        std::env::var_os("USERPROFILE").map(|v| PathBuf::from(v).join("Documents"))
    } else {
        std::env::var_os("HOME").map(|v| PathBuf::from(v).join("Documents"))
    }
}

#[tauri::command]
pub fn desktop_workspace_root(app: AppHandle<Wry>) -> Result<String, String> {
    workspace_root(&app).map(|p| p.display().to_string())
}

#[tauri::command]
pub fn desktop_set_workspace(app: AppHandle<Wry>, path: String) -> Result<(), String> {
    settings::set_agent_workspace(&app, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn desktop_list_screens() -> Result<serde_json::Value, String> {
    let screens = capture::list_screens().map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(screens).unwrap_or(serde_json::Value::Null))
}

#[tauri::command]
pub async fn desktop_screenshot(monitor: Option<usize>) -> Result<tauri::ipc::Response, String> {
    let idx = monitor.unwrap_or(0);
    let bytes = tokio::task::spawn_blocking(move || capture::capture_screen(idx))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[derive(Deserialize)]
pub struct RegionArgs {
    pub monitor: Option<usize>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub async fn desktop_screenshot_region(args: RegionArgs) -> Result<tauri::ipc::Response, String> {
    let bytes = tokio::task::spawn_blocking(move || {
        capture::capture_region(
            args.monitor.unwrap_or(0),
            args.x,
            args.y,
            args.width,
            args.height,
        )
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[derive(Deserialize)]
pub struct ClickArgs {
    pub x: Option<i32>,
    pub y: Option<i32>,
    #[serde(default = "default_button")]
    pub button: String,
    #[serde(default)]
    pub double: bool,
}
fn default_button() -> String {
    "left".into()
}

#[tauri::command]
pub fn desktop_click(args: ClickArgs) -> Result<(), String> {
    let btn = match args.button.to_ascii_lowercase().as_str() {
        "right" => input::MouseBtn::Right,
        "middle" => input::MouseBtn::Middle,
        _ => input::MouseBtn::Left,
    };
    input::click(args.x, args.y, btn, args.double).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn desktop_move_cursor(x: i32, y: i32) -> Result<(), String> {
    input::move_cursor(x, y).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn desktop_type(text: String) -> Result<(), String> {
    input::type_text(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn desktop_key(chord: String) -> Result<(), String> {
    if chord.contains('+') {
        input::press_chord(&chord).map_err(|e| e.to_string())
    } else {
        input::press_key(&chord).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn desktop_scroll(delta: i32, horizontal: Option<bool>) -> Result<(), String> {
    input::scroll(delta, horizontal.unwrap_or(false)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn desktop_top_processes(limit: Option<usize>) -> Result<serde_json::Value, String> {
    let ps = procs::top_processes(limit.unwrap_or(15)).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(ps).unwrap_or(serde_json::Value::Null))
}

#[tauri::command]
pub fn desktop_active_window() -> serde_json::Value {
    match procs::active_window() {
        Some(w) => serde_json::to_value(w).unwrap_or(serde_json::Value::Null),
        None => serde_json::Value::Null,
    }
}

#[derive(Serialize)]
pub struct ContextSnapshot {
    pub is_gaming: bool,
    pub active_window: Option<procs::ActiveWindow>,
    pub top_processes: Vec<procs::ProcInfo>,
}

#[tauri::command]
pub fn desktop_context_snapshot() -> ContextSnapshot {
    let active_window = procs::active_window();
    let top = procs::top_processes(10).unwrap_or_default();
    let is_gaming = top
        .iter()
        .any(|p| p.kind == komorebi_desktop::AppKind::Game && p.cpu > 1.0)
        || active_window
            .as_ref()
            .map(|w| w.kind == komorebi_desktop::AppKind::Game || w.is_fullscreen)
            .unwrap_or(false);
    ContextSnapshot {
        is_gaming,
        active_window,
        top_processes: top,
    }
}

#[derive(Deserialize)]
pub struct WriteFileArgs {
    pub rel_path: String,
    pub contents: String,
}

#[tauri::command]
pub fn desktop_write_file(app: AppHandle<Wry>, args: WriteFileArgs) -> Result<String, String> {
    let root = workspace_root(&app)?;
    let p = files::write_file(&root, &args.rel_path, args.contents.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(p.display().to_string())
}

#[tauri::command]
pub fn desktop_read_file(app: AppHandle<Wry>, rel_path: String) -> Result<String, String> {
    let root = workspace_root(&app)?;
    let bytes = files::read_file(&root, &rel_path).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn desktop_list_dir(app: AppHandle<Wry>, rel_path: String) -> Result<Vec<String>, String> {
    let root = workspace_root(&app)?;
    files::list_dir(&root, &rel_path).map_err(|e| e.to_string())
}

// ---- Virtual desktops (Windows) ----

#[tauri::command]
pub fn desktop_vd_switch_left() -> Result<(), String> {
    vdesktop::perform(vdesktop::VirtualDesktopAction::SwitchLeft).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn desktop_vd_switch_right() -> Result<(), String> {
    vdesktop::perform(vdesktop::VirtualDesktopAction::SwitchRight).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn desktop_vd_create() -> Result<(), String> {
    vdesktop::perform(vdesktop::VirtualDesktopAction::Create).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn desktop_vd_close() -> Result<(), String> {
    vdesktop::perform(vdesktop::VirtualDesktopAction::CloseCurrent).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn desktop_vd_task_view() -> Result<(), String> {
    vdesktop::perform(vdesktop::VirtualDesktopAction::TaskView).map_err(|e| e.to_string())
}
