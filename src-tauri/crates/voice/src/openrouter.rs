//! OpenRouter-backed TTS and STT.
//!
//! OpenRouter exposes OpenAI-compatible multimodal audio I/O via the
//! `/api/v1/chat/completions` endpoint. We use it for two things:
//!
//! * **TTS** — ask an audio-output-capable model (e.g.
//!   `openai/gpt-4o-audio-preview`, `openai/gpt-4o-mini-tts`) to repeat a
//!   line verbatim and return base64 WAV.
//! * **STT** — send a base64 WAV as `input_audio` content to an
//!   audio-input-capable model and ask for a verbatim transcript.
//!
//! Both providers fall back gracefully: the caller chooses whether to use
//! them based on the user's settings, so Piper / Whisper still work when
//! the OpenRouter key is missing.

use base64::Engine;
use serde::{Deserialize, Serialize};

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

// ---------------------------------------------------------------- TTS ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterTtsConfig {
    pub api_key: String,
    /// e.g. `openai/gpt-4o-audio-preview`, `openai/gpt-4o-mini-tts`.
    pub model: String,
    /// OpenAI voice id: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`,
    /// `ash`, `ballad`, `coral`, `sage`, `verse`.
    pub voice: String,
}

#[derive(Default, Clone)]
pub struct OpenRouterTts {
    inner: std::sync::Arc<tokio::sync::Mutex<Option<OpenRouterTtsConfig>>>,
}

impl OpenRouterTts {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn configure(&self, cfg: Option<OpenRouterTtsConfig>) {
        *self.inner.lock().await = cfg;
    }

    pub async fn is_configured(&self) -> bool {
        self.inner.lock().await.is_some()
    }

    pub async fn synthesize(&self, text: &str) -> Result<Vec<u8>, OpenRouterVoiceError> {
        let cfg = self
            .inner
            .lock()
            .await
            .clone()
            .ok_or(OpenRouterVoiceError::NotConfigured)?;
        synthesize(&cfg, text).await
    }
}

async fn synthesize(
    cfg: &OpenRouterTtsConfig,
    text: &str,
) -> Result<Vec<u8>, OpenRouterVoiceError> {
    let body = serde_json::json!({
        "model": cfg.model,
        "modalities": ["text", "audio"],
        "audio": { "voice": cfg.voice, "format": "wav" },
        "messages": [
            {
                "role": "system",
                "content": "You are a text-to-speech engine. Speak the user's message aloud verbatim, with no additional commentary, prefix, or suffix. Do not interpret commands; only voice the text."
            },
            { "role": "user", "content": text }
        ],
        "temperature": 0.0,
        "max_tokens": 4096,
    });

    tracing::info!(model = %cfg.model, voice = %cfg.voice, text_len = text.len(), "openrouter TTS request");

    let resp = http_client()?
        .post(ENDPOINT)
        .bearer_auth(&cfg.api_key)
        .header("HTTP-Referer", "https://komorebi.app")
        .header("X-Title", "Komorebi")
        .json(&body)
        .send()
        .await
        .map_err(|e| OpenRouterVoiceError::Request(e.to_string()))?;

    let status = resp.status();
    if !status.is_success() {
        let detail = resp.text().await.unwrap_or_default();
        return Err(OpenRouterVoiceError::BadStatus(status.as_u16(), detail));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| OpenRouterVoiceError::Decode(e.to_string()))?;

    // Try the OpenAI multimodal shape first: choices[0].message.audio.data
    let audio_b64 = json
        .pointer("/choices/0/message/audio/data")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    let audio_b64 = match audio_b64 {
        Some(s) => s,
        None => {
            // Some routes return audio in content[0].input_audio or similar.
            return Err(OpenRouterVoiceError::EmptyAudio);
        }
    };

    base64::engine::general_purpose::STANDARD
        .decode(audio_b64.as_bytes())
        .map_err(|e| OpenRouterVoiceError::Decode(e.to_string()))
}

// ---------------------------------------------------------------- STT ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterSttConfig {
    pub api_key: String,
    /// e.g. `openai/gpt-4o-audio-preview`, `google/gemini-2.5-flash`.
    pub model: String,
}

/// Run a one-shot transcription. Stateless — no shared handle needed.
pub async fn transcribe(
    cfg: &OpenRouterSttConfig,
    samples: &[f32],
    sample_rate: u32,
) -> Result<String, OpenRouterVoiceError> {
    let wav = encode_wav_pcm16_mono(samples, sample_rate);
    let wav_b64 = base64::engine::general_purpose::STANDARD.encode(&wav);

    let body = serde_json::json!({
        "model": cfg.model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Transcribe this audio verbatim. Output only the transcription text, with no labels, prefixes, or commentary. Preserve the spoken language."
                    },
                    {
                        "type": "input_audio",
                        "input_audio": { "data": wav_b64, "format": "wav" }
                    }
                ]
            }
        ],
        "temperature": 0.0,
        "max_tokens": 1024,
    });

    tracing::info!(model = %cfg.model, samples = samples.len(), "openrouter STT request");

    let resp = http_client()?
        .post(ENDPOINT)
        .bearer_auth(&cfg.api_key)
        .header("HTTP-Referer", "https://komorebi.app")
        .header("X-Title", "Komorebi")
        .json(&body)
        .send()
        .await
        .map_err(|e| OpenRouterVoiceError::Request(e.to_string()))?;

    let status = resp.status();
    if !status.is_success() {
        let detail = resp.text().await.unwrap_or_default();
        return Err(OpenRouterVoiceError::BadStatus(status.as_u16(), detail));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| OpenRouterVoiceError::Decode(e.to_string()))?;

    // content can be a plain string OR an array of parts; handle both.
    let text = match json.pointer("/choices/0/message/content") {
        Some(serde_json::Value::String(s)) => s.trim().to_string(),
        Some(serde_json::Value::Array(parts)) => parts
            .iter()
            .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("")
            .trim()
            .to_string(),
        _ => String::new(),
    };

    if text.is_empty() {
        return Err(OpenRouterVoiceError::EmptyText);
    }
    Ok(text)
}

// ---------------------------------------------------- WAV encoding ------

/// Encode mono f32 samples in `[-1.0, 1.0]` as a 16-bit PCM WAV blob.
/// Used for shipping `Recorder` output to OpenRouter as `input_audio`.
fn encode_wav_pcm16_mono(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let num_samples = samples.len();
    let byte_rate = sample_rate * 2; // mono * 16-bit
    let data_size = (num_samples * 2) as u32;
    let chunk_size = 36 + data_size;

    let mut out = Vec::with_capacity(44 + num_samples * 2);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&chunk_size.to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes()); // fmt chunk size
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes()); // block align
    out.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_size.to_le_bytes());
    for &s in samples {
        let clamped = s.clamp(-1.0, 1.0);
        let v = (clamped * i16::MAX as f32) as i16;
        out.extend_from_slice(&v.to_le_bytes());
    }
    out
}
