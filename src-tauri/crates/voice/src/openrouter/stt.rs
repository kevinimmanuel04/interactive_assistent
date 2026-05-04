//! STT half of the OpenRouter voice provider.
//!
//! We send a base64 WAV as `input_audio` content to an audio-input-capable
//! model (e.g. `openai/gpt-4o-audio-preview`, `google/gemini-2.5-flash`)
//! and ask for a verbatim transcript.

use base64::Engine;
use serde::{Deserialize, Serialize};

use super::wav::encode_wav_pcm16_mono;
use super::{http_client, OpenRouterVoiceError, ENDPOINT};

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
        .header("HTTP-Referer", "https://komorebi.svitix.com")
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
