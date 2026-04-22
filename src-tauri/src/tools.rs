//! LLM-facing tool dispatcher.
//!
//! The chat pipeline instructs the model to call desktop primitives by
//! emitting a small JSON object like `{"tool":"desktop_click", "args":{...}}`.
//! This module provides a single `run_tool` command the frontend can call
//! to execute one of those calls after user confirmation (when the user
//! enables desktop automation in settings). Centralising dispatch here
//! also gives us one place to apply permission checks.

use crate::{desktop_cmds, settings};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Wry};

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

/// Execute one tool call. Frontend is responsible for gating behind user
/// confirmation when `desktop_automation_enabled` is false.
#[tauri::command]
pub async fn run_tool(app: AppHandle<Wry>, call: ToolCall) -> ToolResult {
    let enabled = settings::get_desktop_automation_enabled(&app);
    if !enabled {
        return ToolResult::err("desktop automation disabled in settings");
    }
    match call.tool.as_str() {
        "active_window" => ToolResult::ok(desktop_cmds::desktop_active_window()),
        "context_snapshot" => match serde_json::to_value(desktop_cmds::desktop_context_snapshot()) {
            Ok(v) => ToolResult::ok(v),
            Err(e) => ToolResult::err(e.to_string()),
        },
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
            match serde_json::from_value::<desktop_cmds::ClickArgs>(call.args) {
                Ok(a) => match desktop_cmds::desktop_click(a) {
                    Ok(_) => ToolResult::ok(serde_json::Value::Bool(true)),
                    Err(e) => ToolResult::err(e),
                },
                Err(e) => ToolResult::err(e.to_string()),
            }
        }
        "type" => {
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
            let x = call.args.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let y = call.args.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            match desktop_cmds::desktop_move_cursor(x, y) {
                Ok(_) => ToolResult::ok(serde_json::Value::Bool(true)),
                Err(e) => ToolResult::err(e),
            }
        }
        "write_file" => {
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
        other => ToolResult::err(format!("unknown tool: {other}")),
    }
}
