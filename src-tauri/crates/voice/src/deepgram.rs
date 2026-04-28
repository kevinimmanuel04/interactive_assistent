//! Deepgram cloud STT (Nova-3 by default).
//!
//! Uses the prerecorded REST endpoint
//! `https://api.deepgram.com/v1/listen?model=…` with a 16-bit PCM WAV
//! payload. This is one-shot: we POST the recording captured locally and
//! receive a final transcript. Deepgram also offers a streaming WebSocket
//! variant (`wss://…`) that emits partial results; that lives behind the
//! same key and can be added later as a separate path.
//!
//! Pricing reference (Apr 2026): Nova-3 streaming is ~$0.0043/min;
//! prerecorded similar tier ~$0.0036/min — i.e. cents per hour, the
//! cheapest commercial STT we benchmark against.

use serde::{Deserialize, Serialize};

const ENDPOINT: &str = "https://api.deepgram.com/v1/listen";
const VALIDATE_ENDPOINT: &str = "https://api.deepgram.com/v1/projects";

#[derive(thiserror::Error, Debug)]
pub enum DeepgramError {
    #[error("deepgram not configured")]
    NotConfigured,
    #[error("deepgram request failed: {0}")]
    Request(String),
    #[error("deepgram returned {0}: {1}")]
    BadStatus(u16, String),
    #[error("deepgram response decode error: {0}")]
    Decode(String),
    #[error("deepgram returned no transcript")]
    EmptyText,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepgramConfig {
    pub api_key: String,
    /// e.g. `nova-3`, `nova-2`, `enhanced`.
    pub model: String,
    /// e.g. `multi`, `en`, `ru`. Empty = let Deepgram pick the default.
    pub language: Option<String>,
}

fn http_client() -> Result<reqwest::Client, DeepgramError> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .user_agent(concat!("komorebi/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| DeepgramError::Request(e.to_string()))
}

/// One-shot transcription via prerecorded REST.
pub async fn transcribe(
    cfg: &DeepgramConfig,
    samples: &[f32],
    sample_rate: u32,
) -> Result<String, DeepgramError> {
    let wav = encode_wav_pcm16_mono(samples, sample_rate);

    let mut url = reqwest::Url::parse(ENDPOINT).expect("static url");
    {
        let mut q = url.query_pairs_mut();
        let model = if cfg.model.trim().is_empty() {
            "nova-3"
        } else {
            cfg.model.trim()
        };
        q.append_pair("model", model);
        q.append_pair("smart_format", "true");
        q.append_pair("punctuate", "true");
        if let Some(lang) = cfg.language.as_ref().filter(|s| {
            let s = s.trim();
            !s.is_empty() && s != "auto"
        }) {
            q.append_pair("language", lang.trim());
        }
    }

    tracing::info!(model = %cfg.model, samples = samples.len(), "deepgram STT request");

    let resp = http_client()?
        .post(url)
        .header("Authorization", format!("Token {}", cfg.api_key))
        .header("Content-Type", "audio/wav")
        .body(wav)
        .send()
        .await
        .map_err(|e| DeepgramError::Request(e.to_string()))?;

    let status = resp.status();
    if !status.is_success() {
        let detail = resp.text().await.unwrap_or_default();
        return Err(DeepgramError::BadStatus(status.as_u16(), detail));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| DeepgramError::Decode(e.to_string()))?;

    let text = json
        .pointer("/results/channels/0/alternatives/0/transcript")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    if text.is_empty() {
        return Err(DeepgramError::EmptyText);
    }
    Ok(text)
}

/// Verify that a Deepgram API key is valid by hitting `/v1/projects`,
/// which only succeeds with an authenticated key. Cheap (no audio sent).
pub async fn validate_key(api_key: &str) -> Result<(), DeepgramError> {
    if api_key.trim().is_empty() {
        return Err(DeepgramError::NotConfigured);
    }
    let resp = http_client()?
        .get(VALIDATE_ENDPOINT)
        .header("Authorization", format!("Token {}", api_key.trim()))
        .send()
        .await
        .map_err(|e| DeepgramError::Request(e.to_string()))?;
    let status = resp.status();
    if !status.is_success() {
        let detail = resp.text().await.unwrap_or_default();
        return Err(DeepgramError::BadStatus(status.as_u16(), detail));
    }
    Ok(())
}

fn encode_wav_pcm16_mono(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let num_samples = samples.len();
    let byte_rate = sample_rate * 2;
    let data_size = (num_samples * 2) as u32;
    let chunk_size = 36 + data_size;
    let mut out = Vec::with_capacity(44 + num_samples * 2);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&chunk_size.to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_size.to_le_bytes());
    for &s in samples {
        let clamped = s.clamp(-1.0, 1.0);
        let v = (clamped * i16::MAX as f32) as i16;
        out.extend_from_slice(&v.to_le_bytes());
    }
    out
}
