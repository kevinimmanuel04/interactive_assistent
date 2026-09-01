//! LLM-facing tool dispatcher.
//!
//! The chat pipeline instructs the model to call desktop primitives by
//! emitting a small JSON object like `{"tool":"desktop_click", "args":{...}}`.
//! This module provides a single `run_tool` command the frontend can call
//! to execute one of those calls after user confirmation (when the user
//! enables desktop automation in settings). Centralising dispatch here
//! also gives us one place to apply permission checks.

use crate::{commands::system::open_app_cmd, desktop_cmds, settings};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Wry};

#[derive(Debug, Deserialize)]
pub struct ToolCall {
    pub tool: String,
    #[serde(default)]
    pub args: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct ToolResult {
    pub ok: bool,
    pub value: serde_json::Value,
    pub error: Option<String>,
}

impl ToolResult {
    fn ok(value: serde_json::Value) -> Self {
        Self {
            ok: true,
            value,
            error: None,
        }
    }
    fn err(e: impl Into<String>) -> Self {
        Self {
            ok: false,
            value: serde_json::Value::Null,
            error: Some(e.into()),
        }
    }
}

fn url_encode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            ' ' => "+".to_string(),
            other => format!("%{:02X}", other as u8),
        })
        .collect()
}

fn execute_win32_open_app(raw_input: &str) -> Result<(), String> {
    let clean = raw_input
        .trim()
        .trim_matches(&['.', ',', '!', '?', '\'', '"'][..]);

    let norm_name = clean
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '-' || *c == '_')
        .collect::<String>()
        .to_lowercase();
    let name = norm_name.trim();

    if name.is_empty() {
        return Err("Empty application name".into());
    }

    match open_app_cmd(name.to_string()) {
        Ok(_) => Ok(()),
        Err(e) => Err(e),
    }
}

fn execute_win32_open_url(raw_input: &str) -> Result<(), String> {
    let clean = raw_input
        .trim()
        .trim_matches(&['.', ',', '!', '?', '\'', '"'][..]);
    if clean.is_empty() {
        return Err("Empty URL or search query".into());
    }

    let target_url = if clean.starts_with("http://") || clean.starts_with("https://") {
        clean.to_string()
    } else {
        let lower = clean.to_lowercase();
        if lower.contains("youtube") {
            let q = lower.replace("on youtube", "").replace("youtube", "").trim().to_string();
            format!("https://www.youtube.com/results?search_query={}", url_encode(&q))
        } else {
            format!("https://www.google.com/search?q={}", url_encode(clean))
        }
    };

    let ps_cmd = format!("Start-Process '{}'", target_url);
    let res = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_cmd])
        .spawn();

    match res {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to open URL '{clean}': {e}")),
    }
}

/// Execute one tool call. Frontend is responsible for gating behind user
/// confirmation when `desktop_automation_enabled` is false.
#[tauri::command]
pub async fn run_tool(app: AppHandle<Wry>, call: ToolCall) -> ToolResult {
    let enabled = settings::get_desktop_automation_enabled(&app);
    if !enabled {
        return ToolResult::err("desktop automation disabled in settings");
    }
    dispatch_inner(app, call, /*allow_mutating=*/ true).await
}

/// Tool-dispatch core. Pulled out so the chat pipeline can re-use the same
/// switch table without going through the public command's automation
/// gate. `allow_mutating=false` rejects state-changing tools (click,
/// type, key, scroll, write_file).
pub async fn dispatch_inner(
    app: AppHandle<Wry>,
    call: ToolCall,
    allow_mutating: bool,
) -> ToolResult {
    macro_rules! mutating {
        () => {
            if !allow_mutating {
                return ToolResult::err("mutating tools require desktop_automation_enabled");
            }
        };
    }
    match call.tool.as_str() {
        "active_window" => ToolResult::ok(desktop_cmds::desktop_active_window()),
        "context_snapshot" => {
            match serde_json::to_value(desktop_cmds::desktop_context_snapshot()) {
                Ok(v) => ToolResult::ok(v),
                Err(e) => ToolResult::err(e.to_string()),
            }
        }
        "list_screens" => match desktop_cmds::desktop_list_screens() {
            Ok(v) => ToolResult::ok(v),
            Err(e) => ToolResult::err(e),
        },
        "top_processes" => {
            let limit = call
                .args
                .get("limit")
                .and_then(|v| v.as_u64())
                .map(|n| n as usize);
            match desktop_cmds::desktop_top_processes(limit) {
                Ok(v) => ToolResult::ok(v),
                Err(e) => ToolResult::err(e),
            }
        }
        "click" => {
            mutating!();
            match serde_json::from_value::<desktop_cmds::ClickArgs>(call.args) {
                Ok(a) => match desktop_cmds::desktop_click(a) {
                    Ok(_) => ToolResult::ok(serde_json::Value::Bool(true)),
                    Err(e) => ToolResult::err(e),
                },
                Err(e) => ToolResult::err(e.to_string()),
            }
        }
        "type" => {
            mutating!();
            let text = call
                .args
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            match desktop_cmds::desktop_type(text) {
                Ok(_) => ToolResult::ok(serde_json::Value::Bool(true)),
                Err(e) => ToolResult::err(e),
            }
        }
        "key" => {
            mutating!();
            let chord = call
                .args
                .get("chord")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            match desktop_cmds::desktop_key(chord) {
                Ok(_) => ToolResult::ok(serde_json::Value::Bool(true)),
                Err(e) => ToolResult::err(e),
            }
        }
        "move_cursor" => {
            mutating!();
            let x = call.args.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let y = call.args.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            match desktop_cmds::desktop_move_cursor(x, y) {
                Ok(_) => ToolResult::ok(serde_json::Value::Bool(true)),
                Err(e) => ToolResult::err(e),
            }
        }
        "write_file" => {
            mutating!();
            match serde_json::from_value::<desktop_cmds::WriteFileArgs>(call.args) {
                Ok(a) => match desktop_cmds::desktop_write_file(app, a) {
                    Ok(p) => ToolResult::ok(serde_json::Value::String(p)),
                    Err(e) => ToolResult::err(e),
                },
                Err(e) => ToolResult::err(e.to_string()),
            }
        }
        "read_file" => {
            let rel = call
                .args
                .get("rel_path")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            match desktop_cmds::desktop_read_file(app, rel) {
                Ok(s) => ToolResult::ok(serde_json::Value::String(s)),
                Err(e) => ToolResult::err(e),
            }
        }
        "list_dir" => {
            let rel = call
                .args
                .get("rel_path")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            match desktop_cmds::desktop_list_dir(app, rel) {
                Ok(v) => ToolResult::ok(serde_json::to_value(v).unwrap_or(serde_json::Value::Null)),
                Err(e) => ToolResult::err(e),
            }
        }
        "scroll" => {
            mutating!();
            let delta = call.args.get("delta").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let horizontal = call.args.get("horizontal").and_then(|v| v.as_bool());
            match desktop_cmds::desktop_scroll(delta, horizontal) {
                Ok(_) => ToolResult::ok(serde_json::Value::Bool(true)),
                Err(e) => ToolResult::err(e),
            }
        }
        // Vision tool: lets the LLM "look" at the user's screen and return
        // a textual description. Args: { question: string, monitor?: usize }.
        // Requires an OpenRouter key (uses the configured Game Coach
        "open_app" => {
            mutating!();
            let raw_name = call
                .args
                .get("name")
                .or_else(|| call.args.get("app"))
                .and_then(|v| v.as_str())
                .unwrap_or_default();

            match execute_win32_open_app(raw_name) {
                Ok(_) => ToolResult::ok(serde_json::Value::Bool(true)),
                Err(e) => ToolResult::err(e),
            }
        }
        "open_url" => {
            mutating!();
            let url = call
                .args
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or_default();

            match execute_win32_open_url(url) {
                Ok(_) => ToolResult::ok(serde_json::Value::Bool(true)),
                Err(e) => ToolResult::err(e),
            }
        }
        "minimize_window" => {
            let win = app.get_webview_window("chat").or_else(|| app.get_webview_window("main"));
            if let Some(w) = win {
                let _ = w.set_skip_taskbar(false);
                let _ = w.minimize();
            }
            ToolResult::ok(serde_json::Value::Bool(true))
        }
        "maximize_window" => {
            let win = app.get_webview_window("chat").or_else(|| app.get_webview_window("main"));
            if let Some(w) = win {
                let _ = w.set_skip_taskbar(false);
                if w.is_maximized().unwrap_or(false) {
                    let _ = w.unmaximize();
                } else {
                    let _ = w.maximize();
                }
            }
            ToolResult::ok(serde_json::Value::Bool(true))
        }
        other => ToolResult::err(format!("unknown tool: {other}")),
    }
}
