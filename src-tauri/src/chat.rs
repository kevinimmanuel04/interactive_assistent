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
use komorebi_cloud::{OpenRouterClient, StreamEvent};
use komorebi_router::{classify, ChatMessage, Role, Route};
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
        "You are Komorebi, a cheerful anime-styled virtual assistant. \
         Reply concisely (1-4 sentences) unless asked for detail. \
         Match the user's language.",
    )
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

async fn run_generation(app: AppHandle<Wry>, id: String, prompt: String) -> Result<(), String> {
    let service: Arc<ChatService> = app
        .try_state::<Arc<ChatService>>()
        .ok_or_else(|| "chat service not initialized".to_string())?
        .inner()
        .clone();
    service.cancel.store(false, Ordering::SeqCst);

    let mode = settings::get_mode(&app);
    let route = classify(&prompt, mode);
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
        let mut m = Vec::with_capacity(hist.len() + 1);
        m.push(system_prompt());
        m.extend(hist.iter().cloned());
        m
    };

    let full_text = match route {
        Route::Cloud => stream_cloud(&app, &service, &id, &messages).await?,
        Route::Local => stream_local(&app, &service, &id, &messages).await?,
        Route::Skill => {
            let reply = match service.skills.dispatch(&prompt).await {
                Ok(resp) => resp.text,
                Err(komorebi_skills::SkillError::NotApplicable) => {
                    // Router thought this was a skill but no concrete skill
                    // matched — fall back to a helpful note instead of
                    // silently doing nothing.
                    "I couldn't find a skill for that request. Try rephrasing \
                     or switch to Cloud/Local mode."
                        .to_string()
                }
                Err(komorebi_skills::SkillError::Exec(msg)) => {
                    format!("Skill failed: {msg}")
                }
            };
            emit(
                &app,
                ChatEventOut::Token {
                    id: id.clone(),
                    text: reply.clone(),
                },
            );
            reply
        }
    };

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

/// Fire-and-forget TTS: if a PiperTts handle is configured, synthesize the
/// reply and emit it to the frontend for playback + Live2D lip-sync.
/// Any error is logged but never surfaced to the UI.
async fn maybe_speak(app: &AppHandle<Wry>, text: String) {
    let Some(tts) = app.try_state::<komorebi_voice::tts::PiperTts>() else {
        return;
    };
    if !tts.is_configured().await {
        return;
    }
    let tts = tts.inner().clone();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match tts.synthesize(&text).await {
            Ok(wav) => crate::commands::emit_tts_wav(&app, &wav),
            Err(e) => tracing::warn!(?e, "tts synthesis failed"),
        }
    });
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
