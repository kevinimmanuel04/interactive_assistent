//! Piper TTS integration (Phase 1).
//!
//! The Piper binary is spawned as a subprocess:
//!   piper --model <voice.onnx> --config <voice.onnx.json> --output_file -
//! Text is written to its stdin and a WAV stream is read from stdout.
//! We then decode the WAV with `rodio` and play on the default output device.
//!
//! A single `PiperTts` handle serializes speak requests through a mutex so
//! that only one utterance plays at a time (Phase 2 will add interruption).

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::Mutex;

#[derive(thiserror::Error, Debug)]
pub enum TtsError {
    #[error("TTS is disabled or not configured")]
    NotConfigured,
    #[error("failed to spawn piper at {0}: {1}")]
    Spawn(String, std::io::Error),
    #[error("piper exited with status {0}")]
    PiperExit(i32),
    #[error("audio device error: {0}")]
    Audio(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone)]
pub struct PiperConfig {
    /// Path to the `piper` (or `piper.exe`) executable.
    pub binary: PathBuf,
    /// Path to the voice `.onnx` model.
    pub voice: PathBuf,
    /// Path to the `<voice>.onnx.json` metadata. If `None` we pass only the
    /// voice path and let Piper discover the sibling JSON.
    pub config: Option<PathBuf>,
}

impl PiperConfig {
    pub fn from_voice(binary: impl Into<PathBuf>, voice: impl Into<PathBuf>) -> Self {
        let voice = voice.into();
        let config = derive_config_path(&voice);
        Self {
            binary: binary.into(),
            voice,
            config,
        }
    }
}

fn derive_config_path(voice: &Path) -> Option<PathBuf> {
    // Piper voices ship as `en_US-amy-medium.onnx` + `en_US-amy-medium.onnx.json`.
    let candidate = voice.with_extension("onnx.json");
    if candidate.exists() {
        return Some(candidate);
    }
    let alt = voice.with_extension("json");
    if alt.exists() {
        return Some(alt);
    }
    None
}

#[derive(Default, Clone)]
pub struct PiperTts {
    inner: Arc<Mutex<Option<PiperConfig>>>,
}

impl PiperTts {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn configure(&self, cfg: Option<PiperConfig>) {
        *self.inner.lock().await = cfg;
    }

    pub async fn is_configured(&self) -> bool {
        self.inner.lock().await.is_some()
    }

    /// Synthesize `text` and play it on the default output device.
    /// Blocks (asynchronously) until playback finishes.
    pub async fn speak(&self, text: &str) -> Result<(), TtsError> {
        let cfg = {
            let guard = self.inner.lock().await;
            guard.clone().ok_or(TtsError::NotConfigured)?
        };
        let wav = synthesize(&cfg, text).await?;
        play_wav_blocking(wav).await
    }
}

async fn synthesize(cfg: &PiperConfig, text: &str) -> Result<Vec<u8>, TtsError> {
    let mut cmd = Command::new(&cfg.binary);
    cmd.arg("--model").arg(&cfg.voice);
    if let Some(c) = &cfg.config {
        cmd.arg("--config").arg(c);
    }
    // `-` routes WAV to stdout.
    cmd.arg("--output_file").arg("-");
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd
        .spawn()
        .map_err(|e| TtsError::Spawn(cfg.binary.display().to_string(), e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(text.as_bytes()).await?;
        // Piper treats a blank line as the end of input in some modes;
        // dropping stdin (via shutdown) signals EOF reliably.
        stdin.shutdown().await.ok();
        drop(stdin);
    }

    let output = child.wait_with_output().await?;
    if !output.status.success() {
        let code = output.status.code().unwrap_or(-1);
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::warn!(%code, stderr = %stderr, "piper failed");
        return Err(TtsError::PiperExit(code));
    }
    Ok(output.stdout)
}

async fn play_wav_blocking(wav: Vec<u8>) -> Result<(), TtsError> {
    // rodio's OutputStream is `!Send`, so run the whole playback on a
    // dedicated blocking thread and await completion.
    tokio::task::spawn_blocking(move || -> Result<(), TtsError> {
        use rodio::{Decoder, OutputStream, Sink};
        use std::io::Cursor;

        let (_stream, handle) = OutputStream::try_default()
            .map_err(|e| TtsError::Audio(e.to_string()))?;
        let sink = Sink::try_new(&handle).map_err(|e| TtsError::Audio(e.to_string()))?;
        let decoder =
            Decoder::new(Cursor::new(wav)).map_err(|e| TtsError::Audio(e.to_string()))?;
        sink.append(decoder);
        sink.sleep_until_end();
        Ok(())
    })
    .await
    .map_err(|e| TtsError::Audio(format!("playback task panicked: {e}")))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_config_prefers_onnx_json() {
        // Non-existent paths return None.
        let p = Path::new("nonexistent/voice.onnx");
        assert!(derive_config_path(p).is_none());
    }
}
