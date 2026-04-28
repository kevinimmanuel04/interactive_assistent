//! Faster-Whisper backend.
//!
//! Talks to a self-hosted [`faster-whisper-server`][1] (a.k.a. `speaches`)
//! that exposes an OpenAI-compatible `/v1/audio/transcriptions` endpoint
//! backed by CTranslate2 + Whisper. Typical speed-up over the bundled
//! `whisper-rs` is 4×–8× on CPU and >10× on CUDA, with the same quality
//! as the underlying Whisper model.
//!
//! The user is expected to run the server locally (Docker or `pip install
//! speaches`) and point Komorebi at the URL via Settings. We don't bundle
//! it because the binary is large and platform-specific (Python wheel +
//! CUDA toolkits when GPU acceleration is requested).
//!
//! [1]: https://github.com/speaches-ai/speaches

use serde::{Deserialize, Serialize};

#[derive(thiserror::Error, Debug)]
pub enum FasterWhisperError {
    #[error("faster-whisper not configured")]
    NotConfigured,
    #[error("faster-whisper request failed: {0}")]
    Request(String),
    #[error("faster-whisper returned {0}: {1}")]
    BadStatus(u16, String),
    #[error("faster-whisper response decode error: {0}")]
    Decode(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FasterWhisperConfig {
    /// Base URL, e.g. `http://localhost:8000` or `http://localhost:8000/v1`.
    pub base_url: String,
    /// Model id as exposed by the server, e.g. `Systran/faster-whisper-base`,
    /// `Systran/faster-whisper-large-v3`.
    pub model: String,
    /// Optional language hint (`en`, `ru`, `auto`, …). Empty = autodetect.
    pub language: Option<String>,
}

fn http_client() -> Result<reqwest::Client, FasterWhisperError> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .user_agent(concat!("komorebi/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| FasterWhisperError::Request(e.to_string()))
}

fn normalize_url(base: &str) -> String {
    let trimmed = base.trim().trim_end_matches('/');
    if trimmed.ends_with("/v1") || trimmed.ends_with("/v1/") {
        format!("{}/audio/transcriptions", trimmed.trim_end_matches('/'))
    } else {
        format!("{}/v1/audio/transcriptions", trimmed)
    }
}

/// One-shot transcription. `samples` are mono f32 in `[-1.0, 1.0]`.
pub async fn transcribe(
    cfg: &FasterWhisperConfig,
    samples: &[f32],
    sample_rate: u32,
) -> Result<String, FasterWhisperError> {
    let wav = encode_wav_pcm16_mono(samples, sample_rate);
    let url = normalize_url(&cfg.base_url);

    let part = reqwest::multipart::Part::bytes(wav)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| FasterWhisperError::Request(e.to_string()))?;
    let mut form = reqwest::multipart::Form::new()
        .text("model", cfg.model.clone())
        .text("response_format", "json")
        .part("file", part);
    if let Some(lang) = cfg.language.as_ref().filter(|s| {
        let s = s.trim();
        !s.is_empty() && s != "auto"
    }) {
        form = form.text("language", lang.trim().to_string());
    }

    tracing::info!(url = %url, model = %cfg.model, samples = samples.len(), "faster-whisper STT request");

    let resp = http_client()?
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| FasterWhisperError::Request(e.to_string()))?;

    let status = resp.status();
    if !status.is_success() {
        let detail = resp.text().await.unwrap_or_default();
        return Err(FasterWhisperError::BadStatus(status.as_u16(), detail));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| FasterWhisperError::Decode(e.to_string()))?;
    let text = json
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    Ok(text)
}

/// Probe the server's `/v1/models` (or `/health`) endpoint to confirm it
/// is reachable and responding.
pub async fn validate(base_url: &str) -> Result<(), FasterWhisperError> {
    let trimmed = base_url.trim().trim_end_matches('/');
    let probe = if trimmed.ends_with("/v1") {
        format!("{}/models", trimmed)
    } else {
        format!("{}/v1/models", trimmed)
    };
    let resp = http_client()?
        .get(&probe)
        .send()
        .await
        .map_err(|e| FasterWhisperError::Request(e.to_string()))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let detail = resp.text().await.unwrap_or_default();
        return Err(FasterWhisperError::BadStatus(status.as_u16(), detail));
    }
    Ok(())
}

/// Encode mono f32 samples as a 16-bit PCM WAV blob.
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
