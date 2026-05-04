//! TTS half of the OpenRouter voice provider.
//!
//! We ask an audio-output-capable model (e.g. `openai/gpt-4o-audio-preview`,
//! `openai/gpt-4o-mini-tts`) to repeat the supplied line verbatim and
//! return base64-encoded PCM16 in an SSE stream, which we reassemble and
//! wrap in a WAV header.

use base64::Engine;
use serde::{Deserialize, Serialize};

use super::wav::{trim_trailing_silence, wrap_pcm16_as_wav};
use super::{http_client, OpenRouterVoiceError, ENDPOINT};

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
    // `max_tokens` is sized to the input length: at gpt-4o-audio's ~50 Hz
    // audio token rate, ~50 tokens ≈ 1 s of speech. Speech-rate budget is
    // ~12 chars/s English, so we allow `chars / 12 * 50 * 2` tokens (2x
    // safety margin) and a hard floor/ceiling. Without a tight cap the
    // model frequently keeps emitting silence/repetitions for the full
    // default budget, producing 30-second WAVs for a 30-character reply.
    let chars = text.chars().count() as f32;
    let token_budget = ((chars / 12.0 * 50.0 * 2.0).ceil() as u32).clamp(120, 600);
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
        "max_tokens": token_budget,
    });

    tracing::info!(
        model = %cfg.model,
        voice = %cfg.voice,
        text_len = text.len(),
        token_budget,
        "openrouter TTS request",
    );

    let resp = http_client()?
        .post(ENDPOINT)
        .bearer_auth(&cfg.api_key)
        .header("HTTP-Referer", "https://komorebi.svitix.com")
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

    let (audio_chunks, source, chunks_seen) = collect_audio_chunks(&body_text);

    if audio_chunks.is_empty() {
        let preview: String = body_text.chars().take(1200).collect();
        tracing::warn!(
            chunks_seen,
            response_preview = %preview,
            "openrouter TTS stream had no audio chunks"
        );
        return Err(OpenRouterVoiceError::EmptyAudio);
    }

    // OpenRouter / OpenAI sometimes streams audio as *cumulative* deltas:
    // each successive chunk re-includes everything previously emitted plus
    // a small extension. Naively concatenating those yields audio many
    // times longer than the actual utterance — what the user hears is the
    // phrase, then repeated/overlapping copies, then a buzz/garbage tail.
    //
    // Detection strategies (any one is enough):
    //   1. Decoded bytes form an exact prefix chain (chunk[i] starts with chunk[i-1]).
    //   2. Chunk sizes grow monotonically (typical of cumulative streams).
    //   3. The last chunk alone is ≥ 80 % of the concatenation.
    let decoded: Vec<Vec<u8>> = audio_chunks
        .iter()
        .map(|s| base64::engine::general_purpose::STANDARD.decode(s.as_bytes()))
        .collect::<Result<_, _>>()
        .map_err(|e| OpenRouterVoiceError::Decode(e.to_string()))?;

    let sizes: Vec<usize> = decoded.iter().map(|b| b.len()).collect();
    let total_concat: usize = sizes.iter().sum();
    let first = sizes.first().copied().unwrap_or(0);
    let last = sizes.last().copied().unwrap_or(0);
    let max = sizes.iter().copied().max().unwrap_or(0);
    tracing::info!(
        chunks = decoded.len(),
        first,
        last,
        max,
        total = total_concat,
        "openrouter TTS chunk byte sizes"
    );

    let mut cumulative_strict = decoded.len() >= 2;
    for i in 1..decoded.len() {
        if decoded[i].len() < decoded[i - 1].len() || !decoded[i].starts_with(&decoded[i - 1]) {
            cumulative_strict = false;
            break;
        }
    }

    // Only the strict byte-prefix check is safe enough to trigger
    // "keep last only". Heuristics on chunk sizes (monotonic growth, last
    // share ≥ 80 %) misfire on regular incremental streams and turn the
    // utterance into a 50 ms buzz, which is far worse than tolerating an
    // overlong audio.
    let cumulative = cumulative_strict;

    let pcm: Vec<u8> = if cumulative {
        let last_bytes = decoded.last().cloned().unwrap_or_default();
        tracing::info!(
            chunks = decoded.len(),
            final_len = last_bytes.len(),
            "openrouter TTS deltas are cumulative; keeping only the final chunk"
        );
        last_bytes
    } else {
        decoded.into_iter().flatten().collect()
    };

    // Trim trailing silence / low-amplitude tail. OpenAI's PCM16 stream
    // sometimes finishes with a stretch of near-zero samples followed by
    // a few stray bytes that decode as a brief high-frequency click. We
    // remove any continuous run of samples with |s| < threshold from the
    // end, leaving a 100 ms safety margin.
    let pcm = trim_trailing_silence(&pcm, 24_000, 0.01, 100);

    // Hard duration cap based on input length. The model occasionally
    // goes off the rails on very short inputs and emits 30+ s of audio
    // (repeated phrase, hummed padding, etc.) for a 30-character reply.
    // Estimated speech rate: ~12 chars/sec; allow 3x slack + 2 s safety
    // floor, then clamp into a reasonable absolute window.
    let expected_seconds = (chars / 12.0).max(0.5);
    let max_seconds = (expected_seconds * 3.0 + 2.0).clamp(3.0, 20.0);
    let max_pcm_bytes = (max_seconds * 24_000.0 * 2.0) as usize;
    let pcm = if pcm.len() > max_pcm_bytes {
        let actual_seconds = pcm.len() as f32 / (24_000.0 * 2.0);
        tracing::warn!(
            chars,
            actual_seconds,
            max_seconds,
            "openrouter TTS audio exceeds expected duration; truncating",
        );
        pcm[..max_pcm_bytes].to_vec()
    } else {
        pcm
    };

    tracing::info!(
        chunks_seen,
        chunks_with_audio = audio_chunks.len(),
        source,
        cumulative,
        pcm_bytes = pcm.len(),
        approx_seconds = pcm.len() as f32 / (24_000.0 * 2.0),
        "openrouter TTS stream decoded"
    );

    // OpenAI streams raw PCM16 mono @ 24 kHz; wrap it in a WAV header so
    // downstream playback (which expects WAV) can decode it directly.
    Ok(wrap_pcm16_as_wav(&pcm, 24_000))
}

/// Walk the SSE stream and collect base64 audio fragments. Returns the
/// chosen chunk list (preferring incremental deltas over the final
/// aggregated message — see comment below), the source label for logs,
/// and the total number of SSE frames seen.
///
/// OpenRouter typically sends N incremental `delta.audio.data` chunks
/// followed by a final aggregate `message.audio.data` containing the
/// complete clip. If both are present we MUST use only one source —
/// concatenating both produces ~2× the intended audio (which manifests
/// as duplicated speech and a continuous buzzing tone behind it from the
/// misaligned overlap).
fn collect_audio_chunks(body_text: &str) -> (Vec<String>, &'static str, usize) {
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

    if !delta_chunks.is_empty() {
        (delta_chunks, "delta", chunks_seen)
    } else {
        (message_chunks, "message", chunks_seen)
    }
}
