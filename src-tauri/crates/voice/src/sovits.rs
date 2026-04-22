//! GPT-SoVITS / VITS external TTS provider.
//!
//! Unlike Piper — which we spawn as a subprocess — GPT-SoVITS is a much
//! heavier model (PyTorch / ONNX, ~1–5 GB of weights, needs a GPU for
//! real-time synthesis). Shipping it inside the Tauri binary is not
//! practical. Instead we talk HTTP to the user's locally-running GPT-SoVITS
//! inference server (the official repo ships a FastAPI server that listens
//! on `http://127.0.0.1:9880` by default).
//!
//! Endpoint contract (api_v2.py from RVC-Boss/GPT-SoVITS):
//!   GET/POST /tts
//!     text, text_lang, ref_audio_path, prompt_text, prompt_lang,
//!     speed_factor, media_type=wav, streaming_mode=false
//!   Response: audio/wav bytes on 200.
//!
//! A user-specified URL template is also supported for custom forks.

use serde::{Deserialize, Serialize};

#[derive(thiserror::Error, Debug)]
pub enum SoVitsError {
    #[error("sovits provider not configured")]
    NotConfigured,
    #[error("sovits endpoint returned {0}")]
    BadStatus(u16),
    #[error("sovits request failed: {0}")]
    Request(String),
    #[error("sovits returned empty audio")]
    Empty,
}

/// User-tunable connection + reference-voice settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoVitsConfig {
    /// Base URL of the GPT-SoVITS server (default `http://127.0.0.1:9880`).
    /// We POST to `<base>/tts`.
    pub endpoint: String,
    /// Path on the server's filesystem to the reference audio (3–10 s clip).
    /// For anime-style voices, use an anime seiyuu sample.
    pub ref_audio_path: String,
    /// Transcript of the reference clip.
    pub prompt_text: String,
    /// Language of the reference clip (`ja` / `en` / `zh` / `ru` / `auto`).
    pub prompt_lang: String,
    /// Language to synthesize (same set).
    pub text_lang: String,
    /// Playback speed. 1.0 = natural, 1.1 = slightly faster, etc.
    pub speed: f32,
}

impl Default for SoVitsConfig {
    fn default() -> Self {
        Self {
            endpoint: "http://127.0.0.1:9880".into(),
            ref_audio_path: String::new(),
            prompt_text: String::new(),
            prompt_lang: "ja".into(),
            text_lang: "auto".into(),
            speed: 1.0,
        }
    }
}

#[derive(Default, Clone)]
pub struct SoVitsTts {
    inner: std::sync::Arc<tokio::sync::Mutex<Option<SoVitsConfig>>>,
}

impl SoVitsTts {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn configure(&self, cfg: Option<SoVitsConfig>) {
        *self.inner.lock().await = cfg;
    }

    pub async fn is_configured(&self) -> bool {
        self.inner.lock().await.is_some()
    }

    pub async fn synthesize(&self, text: &str) -> Result<Vec<u8>, SoVitsError> {
        let cfg = self
            .inner
            .lock()
            .await
            .clone()
            .ok_or(SoVitsError::NotConfigured)?;
        synthesize(&cfg, text).await
    }
}

async fn synthesize(cfg: &SoVitsConfig, text: &str) -> Result<Vec<u8>, SoVitsError> {
    let url = format!("{}/tts", cfg.endpoint.trim_end_matches('/'));
    let body = serde_json::json!({
        "text": text,
        "text_lang": cfg.text_lang,
        "ref_audio_path": cfg.ref_audio_path,
        "prompt_text": cfg.prompt_text,
        "prompt_lang": cfg.prompt_lang,
        "speed_factor": cfg.speed,
        "media_type": "wav",
        "streaming_mode": false,
    });
    tracing::info!(url, text_len = text.len(), "sovits request");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| SoVitsError::Request(e.to_string()))?;
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| SoVitsError::Request(e.to_string()))?;
    let status = resp.status();
    if !status.is_success() {
        let detail = resp.text().await.unwrap_or_default();
        tracing::warn!(%status, %detail, "sovits failed");
        return Err(SoVitsError::BadStatus(status.as_u16()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| SoVitsError::Request(e.to_string()))?;
    if bytes.is_empty() {
        return Err(SoVitsError::Empty);
    }
    Ok(bytes.to_vec())
}
