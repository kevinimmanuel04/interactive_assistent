//! Tool-call protocol parsing, execution, and the streaming retry loop.

use super::engines::{stream_cloud, stream_local};
use super::events::{emit, ChatEventOut};
use super::ChatService;
use crate::settings;
use komorebi_router::{ChatMessage, Route};
use tauri::{AppHandle, Wry};

#[derive(Debug)]
pub(super) struct ParsedToolCall {
    pub name: String,
    pub args: serde_json::Value,
}

/// Scan `text` for the first `<tool_call>{...}</tool_call>` block.
/// Tolerant of stray whitespace and surrounding `<mood:X>` tags.
pub(super) fn extract_tool_call(text: &str) -> Option<ParsedToolCall> {
    const OPEN: &str = "<tool_call>";
    const CLOSE: &str = "</tool_call>";
    let start = text.find(OPEN)?;
    let after = start + OPEN.len();
    let end_rel = text[after..].find(CLOSE)?;
    let json = text[after..after + end_rel].trim();
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let name = v.get("tool")?.as_str()?.to_string();
    let args = v.get("args").cloned().unwrap_or(serde_json::Value::Null);
    Some(ParsedToolCall { name, args })
}

/// Tools that don't mutate system state and can run without the
/// `desktop_automation_enabled` flag. Mutating tools require it.
fn is_readonly_tool(name: &str) -> bool {
    matches!(
        name,
        "screen_vision"
            | "active_window"
            | "context_snapshot"
            | "list_screens"
            | "top_processes"
            | "list_dir"
            | "read_file"
    )
}

async fn execute_chat_tool(
    app: &AppHandle<Wry>,
    name: &str,
    args: serde_json::Value,
) -> serde_json::Value {
    let automation = settings::get_desktop_automation_enabled(app);
    if !is_readonly_tool(name) && !automation {
        return serde_json::json!({
            "ok": false,
            "error": "mutating tools require desktop_automation_enabled in settings",
        });
    }
    // Re-use the dispatcher, but bypass the global automation gate for
    // read-only tools by inlining a minimal version here. This keeps
    // run_tool's user-facing semantics (frontend explicit confirmations)
    // intact while letting the chat-pipeline do safe queries silently.
    let call = crate::tools::ToolCall {
        tool: name.to_string(),
        args,
    };
    let result =
        crate::tools::dispatch_inner(app.clone(), call, /*allow_mutating=*/ automation).await;
    serde_json::json!({
        "ok": result.ok,
        "value": result.value,
        "error": result.error,
    })
}

/// Run streaming with tool-call support. Loops up to `MAX_TOOL_ITERATIONS`
/// so the model can chain a tool call → see the result → answer. The
/// tool's output never reaches the spoken/displayed reply directly —
/// only the text after the final iteration is returned.
pub(super) const MAX_TOOL_ITERATIONS: usize = 4;

pub(super) async fn run_with_tools(
    app: &AppHandle<Wry>,
    service: &ChatService,
    id: &str,
    route: Route,
    initial: Vec<ChatMessage>,
) -> Result<String, String> {
    let mut messages = initial;
    let mut last_visible = String::new();
    for iter in 0..MAX_TOOL_ITERATIONS {
        let raw = match route {
            Route::Cloud => stream_cloud(app, service, id, &messages).await?,
            Route::Local => stream_local(app, service, id, &messages).await?,
            Route::Skill => unreachable!("skills don't enter the tool loop"),
        };
        if let Some(call) = extract_tool_call(&raw) {
            tracing::info!(tool = %call.name, "chat: executing tool call");
            // Notify the UI that we're running a tool — purely cosmetic,
            // lets the bubble show a status line. Frontend treats this
            // as a token.
            emit(
                app,
                ChatEventOut::Token {
                    id: id.into(),
                    text: format!("\n<tool_status>{}</tool_status>\n", call.name),
                },
            );
            let result = execute_chat_tool(app, &call.name, call.args.clone()).await;
            // Append assistant's tool-call message + a system message with
            // the result, then loop. The model will continue from there.
            messages.push(ChatMessage::assistant(raw.clone()));
            let result_text = serde_json::to_string(&result).unwrap_or_default();
            messages.push(ChatMessage::system(format!(
                "Tool `{}` returned:\n{}\n\nNow write the final answer for \
                 the user using this result. Do NOT call another tool unless \
                 strictly necessary.",
                call.name, result_text
            )));
            last_visible = raw;
            if iter + 1 == MAX_TOOL_ITERATIONS {
                tracing::warn!("chat: tool loop hit max iterations");
            }
            continue;
        }
        return Ok(raw);
    }
    Ok(last_visible)
}
