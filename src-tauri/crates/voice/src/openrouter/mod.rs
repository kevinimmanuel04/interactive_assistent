//! OpenRouter-backed TTS and STT.
//!
//! OpenRouter exposes OpenAI-compatible multimodal audio I/O via the
//! `/api/v1/chat/completions` endpoint. This module wraps two flavours of
//! that endpoint:
//!
//! * [`tts`] — ask an audio-output-capable model to repeat a line
//!   verbatim and return base64 WAV.
//! * [`stt`] — send a base64 WAV as `input_audio` content to an
//!   audio-input-capable model and ask for a verbatim transcript.
//!
//! Both providers fall back gracefully: the caller chooses whether to use
//! them based on the user's settings, so Piper / Whisper still work when
//! the OpenRouter key is missing.

mod stt;
mod tts;
mod wav;

pub use stt::{transcribe, OpenRouterSttConfig};
pub use tts::{OpenRouterTts, OpenRouterTtsConfig};

const ENDPOINT: &str = "https://openrouter.ai/api/v1/chat/completions";

#[derive(thiserror::Error, Debug)]
pub enum OpenRouterVoiceError {
    #[error("openrouter voice provider not configured")]
    NotConfigured,
    #[error("openrouter returned {0}: {1}")]
    BadStatus(u16, String),
    #[error("openrouter request failed: {0}")]
    Request(String),
    #[error("openrouter returned no audio")]
    EmptyAudio,
    #[error("openrouter returned no text")]
    EmptyText,
    #[error("openrouter response decode error: {0}")]
    Decode(String),
}

fn http_client() -> Result<reqwest::Client, OpenRouterVoiceError> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .user_agent(concat!("komorebi/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| OpenRouterVoiceError::Request(e.to_string()))
}
