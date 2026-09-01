//! LLM engine builders + streaming wrappers (cloud & local).

use super::events::{emit, ChatEventOut};
use super::ChatService;
use crate::settings;
use futures::StreamExt;
use april_cloud::{OpenRouterClient, StreamEvent};
use april_router::ChatMessage;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{AppHandle, Wry};

/// Build the bundled llama.cpp engine from the user's settings. Returns
/// the [`StubEngine`](april_llm::StubEngine) when the model path is
/// not configured or the `local-llm` Cargo feature is off — in either
/// case calls into the engine return [`LlmError::NotAvailable`] which
/// the caller turns into a graceful degradation.
fn build_local_engine(app: &AppHandle<Wry>) -> Arc<dyn april_llm::LlmEngine> {
    build_local_engine_at(app, settings::get_local_model_path(app))
}

/// Public re-export of [`build_local_engine`] for sibling modules
/// (currently `coach::run_text`). Sharing one builder keeps GPU-layer
/// and model-path resolution in one place.
pub(crate) fn build_local_engine_public(app: &AppHandle<Wry>) -> Arc<dyn april_llm::LlmEngine> {
    build_local_engine(app)
}

/// Build a llama.cpp engine pinned to a specific GGUF path. Used by the
/// classifier path so the user can pin a smaller, faster model
/// (e.g. Llama-3.2-3B) while keeping a heavier chat model loaded.
pub(super) fn build_local_engine_at(
    app: &AppHandle<Wry>,
    model_path: Option<String>,
) -> Arc<dyn april_llm::LlmEngine> {
    use april_llm::{default_engine, LlmConfig};
    let mut cfg = LlmConfig::default();
    if let Some(p) = model_path {
        cfg.model_path = Some(std::path::PathBuf::from(p));
    }
    if let Some(n) = settings::get_gpu_layers(app) {
        cfg.n_gpu_layers = Some(n as i32);
    }
    default_engine(cfg)
}

pub(super) async fn stream_cloud(
    app: &AppHandle<Wry>,
    service: &ChatService,
    id: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    let api_key = settings::get_openrouter_key(app)
        .ok_or_else(|| "OpenRouter API key is not set. Open settings and add one.".to_string())?;
    let configured_model = settings::get_openrouter_model(app);
    // Extract the latest user prompt for domain classification & explicit override parsing
    let last_user_prompt = messages
        .iter()
        .rev()
        .find(|m| m.role == april_router::Role::User)
        .map(|m| m.content.as_str())
        .unwrap_or("");

    let route = april_cloud::router::resolve_smart_route(last_user_prompt, &configured_model, &api_key);
    let client = OpenRouterClient::new(api_key).map_err(|e| e.to_string())?;

    let mut last_error = String::from("All cloud models failed to respond");

    for (idx, spec) in route.chain.iter().enumerate() {
        let model_label = if idx == 0 {
            route.initial_label.clone()
        } else {
            format!("🔁 Switched to {}", spec.display_name)
        };

        tracing::info!(
            model = %spec.endpoint_id,
            attempt = idx + 1,
            label = %model_label,
            "stream_cloud: attempting model"
        );

        let stream_result = client.stream_chat(spec.endpoint_id, messages).await;
        let mut stream = match stream_result {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!(model = %spec.endpoint_id, ?e, "Failed to connect to model, trying next");
                last_error = e.to_string();
                continue;
            }
        };

        emit(
            app,
            ChatEventOut::Started {
                id: id.into(),
                route: "cloud".into(),
                model_label: Some(model_label.clone()),
            },
        );

        let mut acc = String::new();
        let mut had_error = false;

        while let Some(evt) = stream.next().await {
            if service.cancel.load(Ordering::SeqCst) {
                return Ok(acc);
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
                Err(e) => {
                    if !acc.trim().is_empty() {
                        tracing::warn!(?e, "Stream ended with error after receiving tokens, completing gracefully");
                        break;
                    }
                    tracing::warn!(?e, "Stream error before receiving tokens");
                    had_error = true;
                    last_error = e.to_string();
                    break;
                }
            }
        }

        if !acc.trim().is_empty() {
            return Ok(acc);
        }

        tracing::warn!(
            model = %spec.endpoint_id,
            had_error,
            "Model returned empty stream or failed, auto-failing over to next model in chain"
        );
    }

    Err(last_error)
}

pub(super) async fn stream_local(
    app: &AppHandle<Wry>,
    _service: &ChatService,
    id: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    use april_llm::{LlmError, LlmEvent};

    let engine = build_local_engine(app);
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
