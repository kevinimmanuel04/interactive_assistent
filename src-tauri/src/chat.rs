//! Chat orchestration: takes a user prompt, classifies it, streams tokens
//! from the chosen engine back to the frontend via Tauri events.
//!
//! Events emitted (all namespaced `chat:*`, serialized as `ChatEvent`):
//! - `chat:started` — `{ route: "local" | "cloud" | "skill", id: String }`
//! - `chat:token`   — `{ id, text }`
//! - `chat:done`    — `{ id, full_text }`
//! - `chat:error`   — `{ id, message }`

use crate::settings;
use futures::StreamExt;
use komorebi_cloud::{CloudIntentClassifier, CloudSkillClassifier, OpenRouterClient, StreamEvent};
use komorebi_router::{classify, classify_async, ChatMessage, Role, Route};
use komorebi_skills::SkillRegistry;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, Wry};
use tokio::sync::Mutex;

/// Shared orchestrator state held in Tauri's managed state.
pub struct ChatService {
    /// History of the current conversation. For MVP this is in-memory only;
    /// SQLite persistence lands alongside RAG in Phase 3.
    history: Mutex<Vec<ChatMessage>>,
    /// Cooperative cancellation flag for the in-flight generation.
    cancel: AtomicBool,
    /// Built-in system skills (volume, clipboard, screenshot, open).
    skills: SkillRegistry,
}

impl Default for ChatService {
    fn default() -> Self {
        Self {
            history: Mutex::new(Vec::new()),
            cancel: AtomicBool::new(false),
            skills: SkillRegistry::with_defaults(),
        }
    }
}

impl ChatService {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn clear(&self) {
        self.history.lock().await.clear();
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ChatEventOut {
    Started { id: String, route: String },
    Token { id: String, text: String },
    Done { id: String, full_text: String },
    Error { id: String, message: String },
}

fn emit(app: &AppHandle<Wry>, evt: ChatEventOut) {
    if let Err(e) = app.emit("chat", &evt) {
        tracing::warn!(?e, "failed to emit chat event");
    }
}

fn system_prompt() -> ChatMessage {
    ChatMessage::system(
        "You are Komorebi, a cheerful, expressive anime-styled virtual \
         assistant. Reply concisely (1-4 sentences) unless asked for \
         detail. Match the user's language. \
         \
         Emotion protocol: ALWAYS prepend EXACTLY ONE of these tags as the \
         very first characters of every reply, before any other text: \
         <mood:neutral> <mood:happy> <mood:sad> <mood:angry> \
         <mood:surprised> <mood:thinking>. The tag will be stripped before \
         display and is used to drive your avatar's facial expression. \
         Pick the tag that best matches your tone — be expressive, don't \
         default to neutral when a feeling fits. Examples: \
         <mood:thinking> while reasoning about a hard request; \
         <mood:happy> for good news, jokes, greetings, praise; \
         <mood:sad> when apologizing, declining, or sharing bad news; \
         <mood:angry> for refusals or errors; \
         <mood:surprised> for unexpected findings or genuine wow. \
         Use <mood:neutral> only when none of the others fit. \
         Never explain the tag, never speak it aloud, never put it \
         anywhere except at the very start.",
    )
}

/// Extra system message appended when chat tool-calls are enabled.
/// Teaches the model the JSON tool-call protocol and the available
/// read-only and mutating tools. Runs in addition to the base system
/// prompt so the protocol can be toggled per-conversation by settings.
fn tools_system_prompt(automation_enabled: bool) -> ChatMessage {
    let mutating = if automation_enabled {
        "\n  - desktop_click {x?:int, y?:int, button?:'left'|'right'|'middle', double?:bool}\n  \
            - desktop_type {text:string}\n  \
            - desktop_key {chord:string}  // e.g. \"Ctrl+C\", \"Enter\"\n  \
            - desktop_scroll {delta:int, horizontal?:bool}\n  \
            - write_file {rel_path:string, contents:string}"
    } else {
        ""
    };
    ChatMessage::system(format!(
        "Tool-use protocol. When a user asks something you cannot answer \
         with text alone — for example 'what's on my screen', 'what \
         window is open', 'what processes are running', 'open this file' \
         — emit EXACTLY ONE tool call on its own line, formatted as:\n\
         <tool_call>{{\"tool\":\"NAME\",\"args\":{{...}}}}</tool_call>\n\
         No commentary before or after. The system will execute it and \
         feed the result back as a system message; you then write the \
         final answer for the user using that result. \n\n\
         Available tools (read-only, always allowed):\n  \
         - screen_vision {{question:string, monitor?:int}}  // capture screen + describe what's on it\n  \
         - active_window {{}}  // returns title + process of the focused window\n  \
         - context_snapshot {{}}  // OS state: active window + top processes\n  \
         - list_screens {{}}  // monitors with resolutions\n  \
         - top_processes {{limit?:int}}  // top CPU/RAM consumers\n  \
         - list_dir {{rel_path:string}}  // workspace folder listing\n  \
         - read_file {{rel_path:string}}  // workspace file contents{mutating}\n\n\
         Rules: never invent tools; never call mutating tools without an \
         explicit user request; if a tool fails, apologize and offer an \
         alternative; if the user just chats, do NOT call any tool — \
         answer normally. The mood-tag rule still applies to your final \
         user-facing reply.",
    ))
}

#[derive(Debug)]
struct ParsedToolCall {
    name: String,
    args: serde_json::Value,
}

/// Scan `text` for the first `<tool_call>{...}</tool_call>` block.
/// Tolerant of stray whitespace and surrounding `<mood:X>` tags.
fn extract_tool_call(text: &str) -> Option<ParsedToolCall> {
    const OPEN: &str = "<tool_call>";
    const CLOSE: &str = "</tool_call>";
    let start = text.find(OPEN)?;
    let after = start + OPEN.len();
    let end_rel = text[after..].find(CLOSE)?;
    let json = text[after..after + end_rel].trim();
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let name = v.get("tool")?.as_str()?.to_string();
    let args = v.get("args").cloned().unwrap_or(serde_json::Value::Null);
    Some(ParsedToolCall {
        name,
        args,
    })
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
    let result = crate::tools::dispatch_inner(app.clone(), call, /*allow_mutating=*/ automation)
        .await;
    serde_json::json!({
        "ok": result.ok,
        "value": result.value,
        "error": result.error,
    })
}

/// Query the RAG index for the top chunks matching `prompt` and format
/// them as a system message. Returns `None` if the index is absent, the
/// query is empty, or no chunks match. Bounded at ~6 snippets / 4 KB to
/// keep local-model context windows happy.
fn build_rag_context(app: &AppHandle<Wry>, prompt: &str) -> Option<String> {
    let rag = app
        .try_state::<Arc<komorebi_storage::RagIndex>>()?
        .inner()
        .clone();
    let hits = match rag.search(prompt, 6) {
        Ok(h) => h,
        Err(e) => {
            tracing::debug!(?e, "rag search failed");
            return None;
        }
    };
    if hits.is_empty() {
        return None;
    }
    let mut out = String::from(
        "Relevant notes from the user's indexed files. Use them only if they \
         help answer the question; otherwise ignore. Cite file names inline \
         when quoting.\n\n",
    );
    let mut budget = 4096usize;
    for h in hits {
        let entry = format!(
            "— {} —\n{}\n\n",
            std::path::Path::new(&h.path)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or(h.path),
            h.snippet
        );
        if entry.len() > budget {
            break;
        }
        budget -= entry.len();
        out.push_str(&entry);
    }
    Some(out)
}

/// Entry point invoked by the Tauri command. Spawns the generation on the
/// async runtime and returns an id the frontend can correlate events with.
pub fn spawn_generation(app: AppHandle<Wry>, id: String, prompt: String) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_generation(app.clone(), id.clone(), prompt).await {
            emit(&app, ChatEventOut::Error { id, message: e });
        }
    });
}

/// Vision entry point: same event protocol as `spawn_generation`, but the
/// user message includes a PNG. Always routes through OpenRouter's vision
/// endpoint (currently the only vision-capable backend wired up). The
/// reply is stored in chat history alongside a synthetic user message
/// noting that an image was attached so subsequent text-only turns can
/// reference what was discussed.
pub fn spawn_vision_generation(
    app: AppHandle<Wry>,
    id: String,
    prompt: String,
    png_bytes: Vec<u8>,
) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_vision_generation(app.clone(), id.clone(), prompt, png_bytes).await {
            emit(&app, ChatEventOut::Error { id, message: e });
        }
    });
}

async fn run_vision_generation(
    app: AppHandle<Wry>,
    id: String,
    prompt: String,
    png_bytes: Vec<u8>,
) -> Result<(), String> {
    let service: Arc<ChatService> = app
        .try_state::<Arc<ChatService>>()
        .ok_or_else(|| "chat service not initialized".to_string())?
        .inner()
        .clone();
    service.cancel.store(false, Ordering::SeqCst);

    let key = settings::get_openrouter_key(&app)
        .ok_or_else(|| "OpenRouter API key required for vision. Add one in settings.".to_string())?;
    let model = settings::get_game_coach_model(&app);

    emit(
        &app,
        ChatEventOut::Started {
            id: id.clone(),
            route: "cloud".into(),
        },
    );

    let user_text = if prompt.trim().is_empty() {
        "Опиши коротко, что ты видишь на этом изображении.".to_string()
    } else {
        prompt.clone()
    };

    // Token-budget the image: vision models bill per pixel-area; downscale
    // to ~1280px wide so a 4K screenshot doesn't burn 4× the tokens.
    let small = downscale_for_vision(&png_bytes, 1280).unwrap_or(png_bytes);

    let client = OpenRouterClient::new(key).map_err(|e| e.to_string())?;
    let raw = client
        .complete_vision(
            &model,
            "You are Komorebi, a cheerful anime-styled assistant looking at \
             the user's screen or attached image. Reply concisely (1-4 \
             sentences) in the user's language; describe what you see and \
             answer their question if any. ALWAYS prepend EXACTLY ONE of \
             these tags as the very first characters: <mood:neutral> \
             <mood:happy> <mood:sad> <mood:angry> <mood:surprised> \
             <mood:thinking>. Never explain the tag. Never speak it aloud.",
            &user_text,
            &small,
            400,
        )
        .await
        .map_err(|e| e.to_string())?;

    if raw.trim().is_empty() {
        return Err("vision model returned empty response".into());
    }

    emit(
        &app,
        ChatEventOut::Token {
            id: id.clone(),
            text: raw.clone(),
        },
    );

    {
        let mut hist = service.history.lock().await;
        // Synthetic user turn: keeps the LLM aware in subsequent text-only
        // turns that an image was discussed.
        hist.push(ChatMessage::user(format!("[смотрит на экран/картинку] {prompt}")));
        hist.push(ChatMessage::assistant(raw.clone()));
    }
    emit(
        &app,
        ChatEventOut::Done {
            id,
            full_text: raw.clone(),
        },
    );
    maybe_speak(&app, raw).await;
    Ok(())
}

/// Downscale a PNG to at most `max_width` pixels wide, preserving aspect
/// ratio. Returns `None` if decoding fails (caller should fall back to
/// the original bytes). Public so `tools.rs` can reuse it.
pub fn downscale_for_vision(png: &[u8], max_width: u32) -> Option<Vec<u8>> {
    let img = image::load_from_memory(png).ok()?;
    let w = img.width();
    if w <= max_width {
        return Some(png.to_vec());
    }
    let ratio = max_width as f32 / w as f32;
    let nh = (img.height() as f32 * ratio) as u32;
    let small = image::imageops::resize(
        &img.to_rgb8(),
        max_width,
        nh.max(1),
        image::imageops::FilterType::Triangle,
    );
    let mut out = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(small)
        .write_to(&mut out, image::ImageFormat::Png)
        .ok()?;
    Some(out.into_inner())
}

async fn run_generation(app: AppHandle<Wry>, id: String, prompt: String) -> Result<(), String> {
    let service: Arc<ChatService> = app
        .try_state::<Arc<ChatService>>()
        .ok_or_else(|| "chat service not initialized".to_string())?
        .inner()
        .clone();
    service.cancel.store(false, Ordering::SeqCst);

    let mode = settings::get_mode(&app);
    let smart = settings::get_smart_routing(&app);
    tracing::info!(
        prompt_len = prompt.chars().count(),
        prompt_preview = %prompt.chars().take(80).collect::<String>(),
        ?mode,
        smart_routing = smart,
        "chat: run_generation start"
    );
    let route = if smart {
        if let Some(key) = settings::get_openrouter_key(&app) {
            let model = settings::get_classifier_model(&app);
            // Smart-skill pre-pass: ask a small LLM whether this query is a
            // skill invocation regardless of phrasing. If yes, short-circuit
            // straight into the named skill.
            let catalog = SkillRegistry::catalog();
            let llm_picked: Option<komorebi_cloud::SkillIntent> =
                if let Ok(picker) = CloudSkillClassifier::new(key.clone(), model.clone(), &catalog)
                {
                    match picker.pick(&prompt).await {
                        Ok(opt) => {
                            tracing::info!(
                                picked = ?opt.as_ref().map(|i| i.skill.as_str()),
                                "chat: LLM skill picker result"
                            );
                            opt
                        }
                        Err(e) => {
                            tracing::debug!(?e, "skill classifier errored");
                            None
                        }
                    }
                } else {
                    None
                };
            // Keyword fallback: if the LLM picker returned `none` (or failed),
            // give the cheap pattern matcher one more shot. Lots of phrasings
            // like "сделай звук 50%" hit our keyword router cleanly even when
            // the classifier model decides the user is "just chatting".
            let resolved_intent = llm_picked.or_else(|| {
                service.skills.classify(&prompt).map(|name| {
                    tracing::info!(skill = name, "keyword router picked skill (LLM said none)");
                    komorebi_cloud::SkillIntent {
                        skill: name.to_string(),
                        command: prompt.clone(),
                    }
                })
            });
            if let Some(intent) = resolved_intent {
                tracing::info!(skill = %intent.skill, "dispatching skill");
                let cmd = if intent.command.trim().is_empty() {
                    prompt.clone()
                } else {
                    intent.command
                };
                emit(
                    &app,
                    ChatEventOut::Started {
                        id: id.clone(),
                        route: "skill".into(),
                    },
                );
                let reply = match service.skills.dispatch_named(&intent.skill, &cmd).await {
                    Ok(r) => r.text,
                    Err(komorebi_skills::SkillError::NotApplicable) => {
                        // The named skill couldn't parse the rephrased command;
                        // fall back to the registry's own keyword dispatch.
                        match service.skills.dispatch(&prompt).await {
                            Ok(r) => r.text,
                            Err(_) => "Skill couldn't run that. Try rephrasing.".into(),
                        }
                    }
                    Err(komorebi_skills::SkillError::Exec(m)) => {
                        format!("Skill failed: {m}")
                    }
                };
                emit(
                    &app,
                    ChatEventOut::Token {
                        id: id.clone(),
                        text: reply.clone(),
                    },
                );
                emit(
                    &app,
                    ChatEventOut::Done {
                        id,
                        full_text: reply.clone(),
                    },
                );
                maybe_speak(&app, reply).await;
                return Ok(());
            }
            match CloudIntentClassifier::new(key, model) {
                Ok(c) => classify_async(&prompt, mode, Some(&c)).await,
                Err(e) => {
                    tracing::debug!(?e, "classifier init failed; using keyword router");
                    classify(&prompt, mode)
                }
            }
        } else {
            classify(&prompt, mode)
        }
    } else {
        classify(&prompt, mode)
    };
    tracing::info!(?route, "chat: route decided");
    emit(
        &app,
        ChatEventOut::Started {
            id: id.clone(),
            route: match route {
                Route::Local => "local".into(),
                Route::Cloud => "cloud".into(),
                Route::Skill => "skill".into(),
            },
        },
    );

    {
        let mut hist = service.history.lock().await;
        hist.push(ChatMessage::user(prompt.clone()));
    }

    let messages: Vec<ChatMessage> = {
        let hist = service.history.lock().await;
        let mut m = Vec::with_capacity(hist.len() + 4);
        m.push(system_prompt());
        // Always include a fresh machine/time context so the LLM can
        // answer simple environment questions ("what time is it", "how
        // much RAM do I have") without a dedicated skill.
        m.push(ChatMessage::system(crate::sysctx::render_context_message()));
        // Tool-use protocol: only when chat tool calls are enabled.
        if settings::get_chat_tool_calls_enabled(&app) {
            m.push(tools_system_prompt(settings::get_desktop_automation_enabled(&app)));
        }
        // RAG: retrieve top-k chunks for the current user prompt and
        // prepend them as an additional system message.
        if settings::get_rag_enabled(&app) {
            if let Some(ctx) = build_rag_context(&app, &prompt) {
                m.push(ChatMessage::system(ctx));
            }
        }
        m.extend(hist.iter().cloned());
        m
    };

    // Tool-call loop: each iteration streams a reply; if it contains a
    // <tool_call>, execute it, append the result as a system message,
    // and run another iteration. Skills bypass this entirely — *unless*
    // the registry says NotApplicable, in which case we silently re-route
    // to the LLM (the keyword router has wider recall than the skills'
    // own parsers, so phrases like "почему у меня нет звука" can land on
    // the volume skill but not parse).
    let mut effective_route = route;
    let full_text = if matches!(route, Route::Skill) {
        match service.skills.dispatch(&prompt).await {
            Ok(resp) => {
                let reply = resp.text;
                emit(
                    &app,
                    ChatEventOut::Token {
                        id: id.clone(),
                        text: reply.clone(),
                    },
                );
                reply
            }
            Err(komorebi_skills::SkillError::NotApplicable) => {
                tracing::info!("skill not applicable, falling back to LLM");
                effective_route = match settings::get_mode(&app) {
                    komorebi_router::Mode::Local => Route::Local,
                    _ => Route::Cloud,
                };
                emit(
                    &app,
                    ChatEventOut::Started {
                        id: id.clone(),
                        route: match effective_route {
                            Route::Local => "local".into(),
                            _ => "cloud".into(),
                        },
                    },
                );
                run_with_tools(&app, &service, &id, effective_route, messages).await?
            }
            Err(komorebi_skills::SkillError::Exec(msg)) => {
                let reply = format!("Skill failed: {msg}");
                emit(
                    &app,
                    ChatEventOut::Token {
                        id: id.clone(),
                        text: reply.clone(),
                    },
                );
                reply
            }
        }
    } else {
        run_with_tools(&app, &service, &id, route, messages).await?
    };
    let _ = effective_route;

    {
        let mut hist = service.history.lock().await;
        hist.push(ChatMessage::assistant(full_text.clone()));
    }
    emit(
        &app,
        ChatEventOut::Done {
            id,
            full_text: full_text.clone(),
        },
    );
    maybe_speak(&app, full_text).await;
    Ok(())
}

/// Run streaming with tool-call support. Loops up to `MAX_ITERATIONS` so
/// the model can chain a tool call → see the result → answer. The tool's
/// output never reaches the spoken/displayed reply directly — only the
/// text after the final iteration is returned.
const MAX_TOOL_ITERATIONS: usize = 4;

async fn run_with_tools(
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

/// Fire-and-forget TTS: if a TTS provider is configured, synthesize the
/// reply and emit it to the frontend for playback + Live2D lip-sync.
/// Any error is logged but never surfaced to the UI.
async fn maybe_speak(app: &AppHandle<Wry>, text: String) {
    let clean = sanitize_for_tts(&text);
    if clean.trim().is_empty() {
        return;
    }
    tracing::info!(
        raw_len = text.len(),
        clean_len = clean.len(),
        preview = %clean.chars().take(120).collect::<String>(),
        "tts input"
    );
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match crate::commands::synthesize_via_provider(&app, &clean).await {
            Ok(Some(wav)) => crate::commands::emit_tts_wav(&app, &wav),
            Ok(None) => {}
            Err(e) => tracing::warn!(%e, "tts synthesis failed"),
        }
    });
}

/// Strip markdown/code fences and other symbols Piper mispronounces as
/// clicks, buzzes, or garbled phonemes. Keeps letters, digits, basic
/// punctuation, and common Unicode letters (Cyrillic, etc.).
fn sanitize_for_tts(text: &str) -> String {
    // First: drop any <mood:X> tags so they aren't pronounced as
    // "less-than mood colon happy greater-than".
    let stripped = strip_mood_tags(text);
    let stripped = strip_inline_tag_block(&stripped, "tool_call");
    let stripped = strip_inline_tag_block(&stripped, "tool_status");
    // Remove fenced code blocks entirely.
    let mut out = String::with_capacity(stripped.len());
    let mut in_fence = false;
    for line in stripped.lines() {
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        out.push_str(line);
        out.push('\n');
    }
    // Strip inline markdown markers and URL/path noise.
    let mut buf = String::with_capacity(out.len());
    let mut prev_space = true;
    for ch in out.chars() {
        let keep = match ch {
            // Preserve sentence structure.
            '.' | ',' | '!' | '?' | ':' | ';' | '\'' | '"' | '-' | '\n' | ' ' => true,
            // Remove markdown noise / code symbols that Piper pronounces as
            // static ("asterisk", "hash", "underscore", backtick clicks).
            '*' | '#' | '`' | '_' | '~' | '[' | ']' | '(' | ')' | '{' | '}' | '<' | '>' | '|'
            | '\\' | '/' | '=' | '+' => false,
            c if c.is_alphanumeric() => true,
            _ => false,
        };
        if keep {
            if ch.is_whitespace() {
                if !prev_space {
                    buf.push(' ');
                    prev_space = true;
                }
            } else {
                buf.push(ch);
                prev_space = false;
            }
        } else if !prev_space {
            // Collapse a removed symbol into a single space to keep word
            // boundaries, e.g. "foo*bar*baz" → "foo bar baz".
            buf.push(' ');
            prev_space = true;
        }
    }
    buf.trim().to_string()
}

/// Remove `<mood:NAME>` markers (case-insensitive). Cheap O(n) scan, no regex.
fn strip_mood_tags(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'<'
            && bytes
                .get(i + 1..i + 6)
                .map(|s| s.eq_ignore_ascii_case(b"mood:"))
                .unwrap_or(false)
        {
            // Find closing '>'.
            if let Some(rel) = bytes[i + 6..].iter().position(|&c| c == b'>') {
                i += 6 + rel + 1;
                continue;
            }
        }
        // Push next UTF-8 char as a whole.
        let ch_len = utf8_char_len(bytes[i]);
        let end = (i + ch_len).min(bytes.len());
        if let Ok(s) = std::str::from_utf8(&bytes[i..end]) {
            out.push_str(s);
        }
        i = end;
    }
    out
}

/// Remove `<NAME>...</NAME>` blocks from `text`. Used to keep tool-call
/// protocol markers out of TTS audio.
fn strip_inline_tag_block(text: &str, name: &str) -> String {
    let open = format!("<{name}>");
    let close = format!("</{name}>");
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find(&open) {
        out.push_str(&rest[..start]);
        let after = &rest[start + open.len()..];
        if let Some(end) = after.find(&close) {
            rest = &after[end + close.len()..];
        } else {
            // Unterminated: drop the rest to be safe.
            rest = "";
            break;
        }
    }
    out.push_str(rest);
    out
}

#[inline]
fn utf8_char_len(b: u8) -> usize {
    // ASCII or unexpected continuation byte (shouldn't happen at boundary).
    if b < 0xC0 {
        1
    } else if b < 0xE0 {
        2
    } else if b < 0xF0 {
        3
    } else {
        4
    }
}

async fn stream_cloud(
    app: &AppHandle<Wry>,
    service: &ChatService,
    id: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    let api_key = settings::get_openrouter_key(app)
        .ok_or_else(|| "OpenRouter API key is not set. Open settings and add one.".to_string())?;
    let model = settings::get_openrouter_model(app);
    let client = OpenRouterClient::new(api_key).map_err(|e| e.to_string())?;

    let mut stream = client
        .stream_chat(&model, messages)
        .await
        .map_err(|e| e.to_string())?;

    let mut acc = String::new();
    while let Some(evt) = stream.next().await {
        if service.cancel.load(Ordering::SeqCst) {
            break;
        }
        match evt {
            Ok(StreamEvent::Token(t)) => {
                acc.push_str(&t);
                emit(
                    app,
                    ChatEventOut::Token {
                        id: id.into(),
                        text: t,
                    },
                );
            }
            Ok(StreamEvent::Done) => break,
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(acc)
}

async fn stream_local(
    app: &AppHandle<Wry>,
    _service: &ChatService,
    id: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    use komorebi_llm::{default_engine, LlmConfig, LlmError, LlmEvent};

    let mut cfg = LlmConfig::default();
    if let Some(p) = settings::get_local_model_path(app) {
        cfg.model_path = Some(std::path::PathBuf::from(p));
    }
    if let Some(n) = settings::get_gpu_layers(app) {
        cfg.n_gpu_layers = Some(n as i32);
    }
    let engine = default_engine(cfg);
    match engine.stream_chat(messages).await {
        Ok(mut stream) => {
            let mut acc = String::new();
            while let Some(evt) = stream.next().await {
                match evt {
                    Ok(LlmEvent::Token(t)) => {
                        acc.push_str(&t);
                        emit(
                            app,
                            ChatEventOut::Token {
                                id: id.into(),
                                text: t,
                            },
                        );
                    }
                    Ok(LlmEvent::Done) => break,
                    Err(e) => return Err(e.to_string()),
                }
            }
            Ok(acc)
        }
        Err(LlmError::NotAvailable) => {
            // Graceful fallback: tell the user how to proceed.
            let msg = "Local model isn't wired up yet in this build. \
                       Switch to Cloud mode in settings (Auto will still fall back to Cloud for heavy queries).";
            emit(
                app,
                ChatEventOut::Token {
                    id: id.into(),
                    text: msg.into(),
                },
            );
            Ok(msg.to_string())
        }
        Err(e) => Err(e.to_string()),
    }
}

// Silence the unused-import warning on the untyped `Role` re-export.
#[allow(dead_code)]
fn _roles_referenced() -> Role {
    Role::Assistant
}
