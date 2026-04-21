//! Local LLM engine (llama.cpp via FFI). Phase 1.
//!
//! Responsibilities:
//! - Load / unload GGUF models on demand (idle timer based).
//! - Stream tokens back to the app via an async channel.
//! - Enforce memory budget (unload after N minutes of inactivity).

use std::time::Duration;

#[derive(Debug, Clone)]
pub struct LlmConfig {
    pub model_path: String,
    pub n_ctx: u32,
    pub n_threads: i32,
    pub idle_unload_after: Duration,
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            model_path: String::new(),
            n_ctx: 4096,
            n_threads: 0, // auto
            idle_unload_after: Duration::from_secs(180),
        }
    }
}

#[derive(thiserror::Error, Debug)]
pub enum LlmError {
    #[error("model not loaded")]
    NotLoaded,
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

/// Placeholder engine; real implementation in Phase 1.
pub struct LlmEngine {
    _cfg: LlmConfig,
}

impl LlmEngine {
    pub fn new(cfg: LlmConfig) -> Self {
        Self { _cfg: cfg }
    }
}
