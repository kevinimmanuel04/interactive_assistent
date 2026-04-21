//! OpenRouter cloud client. Phase 1.
//!
//! Streams chat completions via SSE; API key stored in OS keyring (not here).

use serde::{Deserialize, Serialize};

pub const DEFAULT_MODEL: &str = "anthropic/claude-3.5-sonnet";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(thiserror::Error, Debug)]
pub enum CloudError {
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("missing api key")]
    MissingApiKey,
}

/// Placeholder. Real streaming client added in Phase 1.
pub struct OpenRouterClient {
    _http: reqwest::Client,
}

impl OpenRouterClient {
    pub fn new() -> Self {
        Self {
            _http: reqwest::Client::new(),
        }
    }
}

impl Default for OpenRouterClient {
    fn default() -> Self {
        Self::new()
    }
}
