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

/// Knobs for one-shot completions. The default `complete()` impl
/// honors `max_tokens` only; backends that override `complete()`
/// (notably [`llama::LlamaEngine`]) honor both `max_tokens` and
/// `temperature` at the sampler level. Setting `temperature = Some(0.0)`
/// requests greedy/deterministic decoding — required for the skill
/// classifier's stable JSON output.
#[derive(Debug, Clone, Default)]
pub struct CompletionOptions {
    /// Hard ceiling on response length. The default `complete()` impl
    /// uses ~6 chars/token as a rough budget when the engine doesn't
    /// expose token counting; overriding backends apply it directly to
    /// the sampler's max-new-tokens cap.
    pub max_tokens: Option<u32>,
    /// Sampling temperature. Honored by backends that override
    /// `complete()` (currently the bundled llama.cpp engine). The
    /// default trait impl ignores it because draining a stream cannot
    /// retroactively change how its tokens were sampled.
    pub temperature: Option<f32>,
}

#[async_trait]
pub trait LlmEngine: Send + Sync {
    async fn stream_chat(&self, messages: &[ChatMessage]) -> Result<LlmStream, LlmError>;

    /// One-shot non-streaming completion. The default implementation
    /// drains [`stream_chat`] and concatenates the tokens, which is
    /// good enough for short structured outputs (intent classifiers,
    /// JSON tags, single-word labels). Backends are free to override
    /// for true non-streaming generation with explicit sampling control.
    async fn complete(
        &self,
        messages: &[ChatMessage],
        opts: CompletionOptions,
    ) -> Result<String, LlmError> {
        use futures::StreamExt;
        let mut stream = self.stream_chat(messages).await?;
        let mut out = String::new();
        // Rough char budget: ~6 chars per token covers typical UTF-8
        // output for the small classifier models we target. Generous
        // enough that a complete `{...}` JSON object always fits.
        let cap = opts.max_tokens.map(|n| (n as usize).saturating_mul(6));
        while let Some(evt) = stream.next().await {
            match evt? {
                LlmEvent::Token(t) => {
                    out.push_str(&t);
                    if let Some(c) = cap {
                        if out.len() >= c {
                            break;
                        }
                    }
                }
                LlmEvent::Done => break,
            }
        }
        Ok(out)
    }
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
