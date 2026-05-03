//! Image generation backends for Komorebi.
//!
//! Three providers behind a single `Generator` trait:
//! - `openrouter` — multimodal chat completions with `modalities: ["image"]`.
//! - `replicate`  — REST API with prediction polling.
//! - `local`      — shell out to a `stable-diffusion.cpp` (sd.exe) binary.
//!
//! All providers return a PNG byte buffer on success. The Tauri host emits
//! `image:*` events; this crate is intentionally pure (no Tauri imports) so
//! it stays unit-testable.

use serde::{Deserialize, Serialize};
use thiserror::Error;

pub mod local;
pub mod openrouter;
pub mod replicate;

#[derive(Debug, Error)]
pub enum ImageGenError {
    #[error("missing credential: {0}")]
    MissingCredential(&'static str),
    #[error("missing configuration: {0}")]
    MissingConfig(&'static str),
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("decode error: {0}")]
    Decode(String),
    #[error("provider returned no image")]
    NoImage,
    #[error("provider error: {0}")]
    Provider(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("operation cancelled")]
    Cancelled,
    #[error("timed out")]
    Timeout,
}

pub type Result<T> = std::result::Result<T, ImageGenError>;

/// Inputs every backend understands. Some providers ignore fields that
/// don't map to their API (e.g. OpenRouter's image modality currently
/// gives the model latitude over size).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateRequest {
    pub prompt: String,
    pub negative_prompt: Option<String>,
    pub width: u32,
    pub height: u32,
    pub steps: u32,
    pub seed: Option<i64>,
    pub guidance: Option<f32>,
}

impl Default for GenerateRequest {
    fn default() -> Self {
        Self {
            prompt: String::new(),
            negative_prompt: None,
            width: 768,
            height: 768,
            steps: 20,
            seed: None,
            guidance: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct GenerateOk {
    pub png: Vec<u8>,
    /// Some providers send back the prompt they actually used (after
    /// sanitization or model rewrites). Forwarded to the UI when present.
    pub revised_prompt: Option<String>,
}

#[async_trait::async_trait]
pub trait Generator: Send + Sync {
    async fn generate(&self, req: &GenerateRequest) -> Result<GenerateOk>;
}

/// Strip the `data:<mime>;base64,` prefix, if present, and decode the body.
pub(crate) fn decode_data_uri_or_b64(s: &str) -> Result<Vec<u8>> {
    use base64::Engine as _;
    let body = if let Some(idx) = s.find("base64,") {
        &s[idx + 7..]
    } else {
        s
    };
    base64::engine::general_purpose::STANDARD
        .decode(body.trim())
        .map_err(|e| ImageGenError::Decode(e.to_string()))
}
