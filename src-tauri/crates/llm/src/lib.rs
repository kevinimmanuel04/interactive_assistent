//! Local LLM engine.
//!
//! The `local-llm` feature enables the real llama.cpp FFI integration
//! (see `llama.rs`); without it, `default_engine` returns a stub that
//! reports `NotAvailable` so callers can route to the cloud.

use async_trait::async_trait;
use futures::Stream;
use komorebi_router::ChatMessage;
use std::pin::Pin;
use std::time::Duration;

#[cfg(feature = "local-llm")]
mod llama;

#[derive(Debug, Clone)]
pub struct LlmConfig {
    pub model_path: Option<std::path::PathBuf>,
    pub n_ctx: u32,
    pub n_threads: i32,
    pub idle_unload_after: Duration,
    /// Number of layers to offload to the GPU. `None` = auto (let backend
    /// decide), `Some(0)` = CPU only, `Some(n > 0)` = offload n layers,
    /// `Some(-1)` / very large = offload everything.
    pub n_gpu_layers: Option<i32>,
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            model_path: None,
            n_ctx: 4096,
            n_threads: 0, // auto
            idle_unload_after: Duration::from_secs(180),
            n_gpu_layers: None,
        }
    }
}

#[derive(thiserror::Error, Debug)]
pub enum LlmError {
    #[error("local model not available: enable the `local-llm` Cargo feature and set model_path in settings")]
    NotAvailable,
    #[error("model not loaded")]
    NotLoaded,
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Other(String),
}

#[derive(Debug, Clone)]
pub enum LlmEvent {
    Token(String),
    Done,
}

pub type LlmStream = Pin<Box<dyn Stream<Item = Result<LlmEvent, LlmError>> + Send>>;

#[async_trait]
pub trait LlmEngine: Send + Sync {
    async fn stream_chat(&self, messages: &[ChatMessage]) -> Result<LlmStream, LlmError>;
}

/// Stub engine used until the `local-llm` feature lands. Returns a clear
/// `NotAvailable` error so the UI can fall back to cloud or prompt the user.
pub struct StubEngine;

#[async_trait]
impl LlmEngine for StubEngine {
    async fn stream_chat(&self, _messages: &[ChatMessage]) -> Result<LlmStream, LlmError> {
        Err(LlmError::NotAvailable)
    }
}

/// Construct the default engine for the current build configuration.
pub fn default_engine(_cfg: LlmConfig) -> std::sync::Arc<dyn LlmEngine> {
    #[cfg(feature = "local-llm")]
    {
        if _cfg.model_path.is_some() {
            if let Some(engine) = llama::LlamaEngine::try_new(_cfg.clone()) {
                return std::sync::Arc::new(engine);
            }
            tracing::warn!("llama backend init failed; falling back to stub");
        }
    }
    std::sync::Arc::new(StubEngine)
}
