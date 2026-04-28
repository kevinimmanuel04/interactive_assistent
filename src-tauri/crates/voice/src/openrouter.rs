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
    // OpenRouter requires `stream: true` for audio output; non-streaming
    // requests are rejected with HTTP 400 ("Audio output requires stream:
    // true"). We therefore always stream and reassemble the base64 PCM
    // from the SSE deltas.
    //
    // `max_tokens` is intentionally tight: at gpt-4o-audio's ~50 Hz audio
    // token rate, 600 tokens ≈ 12 s of speech, which is enough for any
    // single chat reply. Without this cap the model frequently keeps
    // generating silence/repetitions for the full default budget,
    // producing minute-long WAVs for ~5 s of text.
    let body = serde_json::json!({
        "model": cfg.model,
        "modalities": ["text", "audio"],
        // OpenAI streaming only supports pcm16 (24 kHz mono 16-bit LE).
        "audio": { "voice": cfg.voice, "format": "pcm16" },
        "stream": true,
        "messages": [
            {
                "role": "user",
                "content": format!("Read this aloud verbatim, no commentary:\n\n{}", text)
            }
        ],
        "temperature": 0.0,
        "max_tokens": 600,
    });

    tracing::info!(model = %cfg.model, voice = %cfg.voice, text_len = text.len(), "openrouter TTS request");

    let resp = http_client()?
        .post(ENDPOINT)
        .bearer_auth(&cfg.api_key)
        .header("HTTP-Referer", "https://komorebi.app")
        .header("X-Title", "Komorebi")
        .header("Accept", "text/event-stream")
        .json(&body)
        .send()
        .await
        .map_err(|e| OpenRouterVoiceError::Request(e.to_string()))?;

    let status = resp.status();
    if !status.is_success() {
        let detail = resp.text().await.unwrap_or_default();
        return Err(OpenRouterVoiceError::BadStatus(status.as_u16(), detail));
    }

    let body_text = resp
        .text()
        .await
        .map_err(|e| OpenRouterVoiceError::Request(e.to_string()))?;

    // Collect audio fragments, keeping delta and final-message frames in
    // separate buckets. OpenRouter typically sends N incremental
    // `delta.audio.data` chunks followed by a final aggregate
    // `message.audio.data` containing the complete clip. If both are
    // present we MUST use only one source — concatenating both produces
    // ~2× the intended audio (which manifests as duplicated speech and a
    // continuous buzzing tone behind it from the misaligned overlap).
    let mut delta_chunks: Vec<String> = Vec::new();
    let mut message_chunks: Vec<String> = Vec::new();
    let mut chunks_seen = 0usize;
    for line in body_text.lines() {
        let line = line.trim_start();
        let payload = match line.strip_prefix("data:") {
            Some(p) => p.trim_start(),
            None => continue,
        };
        if payload.is_empty() || payload == "[DONE]" {
            continue;
        }
        let chunk: serde_json::Value = match serde_json::from_str(payload) {
            Ok(v) => v,
            Err(_) => continue,
        };
        chunks_seen += 1;

        // Direct audio object on delta or message.
        let delta_paths = [
            "/choices/0/delta/audio/data",
            "/choices/0/delta/audio/b64_json",
        ];
        let message_paths = [
            "/choices/0/message/audio/data",
            "/choices/0/message/audio/b64_json",
        ];
        let mut pushed = false;
        for ptr in delta_paths {
            if let Some(s) = chunk.pointer(ptr).and_then(|v| v.as_str()) {
                delta_chunks.push(s.to_string());
                pushed = true;
                break;
            }
        }
        if !pushed {
            for ptr in message_paths {
                if let Some(s) = chunk.pointer(ptr).and_then(|v| v.as_str()) {
                    message_chunks.push(s.to_string());
                    pushed = true;
                    break;
                }
            }
        }
        if pushed {
            continue;
        }
        // Fallback: walk content arrays.
        for (path, is_delta) in [
            ("/choices/0/delta/content", true),
            ("/choices/0/message/content", false),
        ] {
            if let Some(arr) = chunk.pointer(path).and_then(|v| v.as_array()) {
                for c in arr {
                    if let Some(s) = c
                        .pointer("/audio/data")
                        .or_else(|| c.pointer("/audio/b64_json"))
                        .or_else(|| c.pointer("/input_audio/data"))
                        .and_then(|v| v.as_str())
                    {
                        if is_delta {
                            delta_chunks.push(s.to_string());
                        } else {
                            message_chunks.push(s.to_string());
                        }
                    }
                }
            }
        }
    }

    // Prefer incremental deltas when present (typical streaming case).
    // If we only have a final aggregated message, use that.
    let (audio_chunks, source) = if !delta_chunks.is_empty() {
        (delta_chunks, "delta")
    } else {
        (message_chunks, "message")
    };

    if audio_chunks.is_empty() {
        let preview: String = body_text.chars().take(1200).collect();
        tracing::warn!(
            chunks_seen,
            response_preview = %preview,
            "openrouter TTS stream had no audio chunks"
        );
        return Err(OpenRouterVoiceError::EmptyAudio);
    }

    // Decoding strategy:
    //   1. Try the OpenAI-recommended path: concatenate the base64 strings
    //      and decode once. This is correct when chunks are byte-aligned.
    //   2. If that fails (some relays insert per-chunk `=` padding which
    //      is invalid mid-stream), fall back to decoding each chunk
    //      individually and concatenating the raw bytes.
    let joined: String = audio_chunks.concat();
    let pcm = match base64::engine::general_purpose::STANDARD.decode(joined.as_bytes()) {
        Ok(bytes) => bytes,
        Err(_) => {
            let mut buf = Vec::with_capacity(audio_chunks.iter().map(|s| s.len() * 3 / 4).sum());
            for chunk in &audio_chunks {
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(chunk.as_bytes())
                    .map_err(|e| OpenRouterVoiceError::Decode(e.to_string()))?;
                buf.extend_from_slice(&bytes);
            }
            buf
        }
    };

    tracing::info!(
        chunks_seen,
        chunks_with_audio = audio_chunks.len(),
        source,
        pcm_bytes = pcm.len(),
        approx_seconds = pcm.len() as f32 / (24_000.0 * 2.0),
        "openrouter TTS stream decoded"
    );

    // OpenAI streams raw PCM16 mono @ 24 kHz; wrap it in a WAV header so
    // downstream playback (which expects WAV) can decode it directly.
    Ok(wrap_pcm16_as_wav(&pcm, 24_000))
}

/// Build a WAV container around an already-encoded little-endian PCM16
/// mono byte stream.
fn wrap_pcm16_as_wav(pcm: &[u8], sample_rate: u32) -> Vec<u8> {
    let data_size = pcm.len() as u32;
    let chunk_size = 36 + data_size;
    let byte_rate = sample_rate * 2;

    let mut out = Vec::with_capacity(44 + pcm.len());
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
    out.extend_from_slice(pcm);
    out
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
