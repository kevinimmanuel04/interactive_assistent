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
    /// Phoneme length multiplier. `<1.0` → faster/higher-pitched speech,
    /// `>1.0` → slower/deeper. Piper default is 1.0. `None` leaves the
    /// setting to the voice's `onnx.json` default.
    pub length_scale: Option<f32>,
    /// Phoneme-level variability. Higher = more expressive, lower = flatter.
    /// Typical range 0.3–1.0. Piper default is 0.667.
    pub noise_scale: Option<f32>,
    /// Per-phoneme length noise. Higher = more rhythmic variability.
    /// Typical range 0.3–1.0. Piper default is 0.8.
    pub noise_w: Option<f32>,
}

impl PiperConfig {
    pub fn from_voice(binary: impl Into<PathBuf>, voice: impl Into<PathBuf>) -> Self {
        let voice = voice.into();
        let config = derive_config_path(&voice);
        Self {
            binary: binary.into(),
            voice,
            config,
            length_scale: None,
            noise_scale: None,
            noise_w: None,
        }
    }

    pub fn with_prosody(
        mut self,
        length_scale: Option<f32>,
        noise_scale: Option<f32>,
        noise_w: Option<f32>,
    ) -> Self {
        self.length_scale = length_scale;
        self.noise_scale = noise_scale;
        self.noise_w = noise_w;
        self
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
        let wav = self.synthesize(text).await?;
        play_wav_blocking(wav).await
    }

    /// Synthesize `text` and return the raw WAV bytes without playing them.
    /// Used by the frontend lip-sync pipeline (Phase 2C), which plays the
    /// audio via Web Audio API and drives the Live2D mouth parameter.
    pub async fn synthesize(&self, text: &str) -> Result<Vec<u8>, TtsError> {
        let cfg = {
            let guard = self.inner.lock().await;
            guard.clone().ok_or(TtsError::NotConfigured)?
        };
        synthesize(&cfg, text).await
    }
}

async fn synthesize(cfg: &PiperConfig, text: &str) -> Result<Vec<u8>, TtsError> {
    // DIAGNOSTIC: dump the exact bytes we hand to Piper so we can compare
    // against a known-good manual invocation. Also save to a temp file so
    // it can be re-fed to Piper outside the app.
    let bytes = text.as_bytes();
    let dump_path = std::env::temp_dir().join("komorebi-tts-last-input.txt");
    let _ = std::fs::write(&dump_path, bytes);
    let head: Vec<String> = bytes.iter().take(32).map(|b| format!("{b:02X}")).collect();
    let tail: Vec<String> = bytes
        .iter()
        .rev()
        .take(16)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|b| format!("{b:02X}"))
        .collect();
    tracing::info!(
        len = bytes.len(),
        head = %head.join(" "),
        tail = %tail.join(" "),
        dump = %dump_path.display(),
        "piper stdin bytes"
    );

    tracing::info!(
        binary = %cfg.binary.display(),
        voice = %cfg.voice.display(),
        config = ?cfg.config.as_ref().map(|p| p.display().to_string()),
        cwd = ?cfg.binary.parent().map(|p| p.display().to_string()),
        "piper invocation"
    );

    let mut cmd = Command::new(&cfg.binary);
    // Piper resolves `espeak-ng-data/` relative to its CURRENT WORKING
    // DIRECTORY — not the binary's own directory. When spawned from a
    // Tauri GUI the cwd is the app's install/dev dir, so Piper can't find
    // the phoneme tables and falls back to garbled output.
    // Explicitly set cwd to the directory that holds piper.exe, where
    // espeak-ng-data sits alongside.
    if let Some(parent) = cfg.binary.parent() {
        cmd.current_dir(parent);
        // Purge any env that might redirect espeak/onnx to the wrong files.
        cmd.env_remove("ESPEAK_DATA_PATH");
        cmd.env_remove("PIPER_DATA_PATH");
        cmd.env_remove("PIPER_ESPEAK_DATA");
        // Force onnxruntime to use CPU execution provider only. The bundled
        // onnxruntime 1.14 ships a `providers_shared` DLL that will happily
        // pick up CUDA/DirectML if available, but inference on GPU with that
        // old version produces audible static on recent drivers. CPU is
        // fast enough for Piper (real-time factor ~0.1).
        cmd.env("ORT_DISABLE_ALL_OPTIMIZATION", "0");
        cmd.env_remove("CUDA_VISIBLE_DEVICES");
        cmd.env("CUDA_VISIBLE_DEVICES", "-1");
        cmd.env_remove("ONNXRUNTIME_PROVIDERS");
        // Force a minimal PATH with ONLY piper's own directory, plus the
        // bare Windows system dirs. This prevents system-wide onnxruntime
        // DLLs (e.g. Windows ML 1.17) from hijacking Piper's bundled 1.14
        // through the usual DLL search path.
        #[cfg(windows)]
        {
            let sys = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
            let new_path = format!("{};{sys}\\System32;{sys}", parent.display());
            cmd.env("PATH", new_path);
        }
        #[cfg(not(windows))]
        {
            let existing = std::env::var("PATH").unwrap_or_default();
            let new_path = format!("{}:{existing}", parent.display());
            cmd.env("PATH", new_path);
        }
    }
    // Pass --espeak_data too, belt-and-braces, so it works even if cwd
    // is hijacked by something else down the road.
    if let Some(parent) = cfg.binary.parent() {
        let espeak = parent.join("espeak-ng-data");
        if espeak.is_dir() {
            cmd.arg("--espeak_data").arg(&espeak);
        }
    }
    cmd.arg("--model").arg(&cfg.voice);
    if let Some(c) = &cfg.config {
        cmd.arg("--config").arg(c);
    }
    if let Some(v) = cfg.length_scale {
        cmd.arg("--length_scale").arg(format!("{v:.3}"));
    }
    if let Some(v) = cfg.noise_scale {
        cmd.arg("--noise_scale").arg(format!("{v:.3}"));
    }
    if let Some(v) = cfg.noise_w {
        cmd.arg("--noise_w").arg(format!("{v:.3}"));
    }
    // Keep Piper verbose so we can inspect the phonemes it chose — helps
    // diagnose cases where the phonemizer falls back to nonsense.
    cmd.arg("--debug");
    // Write the WAV to a temp file instead of routing through stdout.
    // Piper on Windows leaves stdout in TEXT mode when `--output_file -`
    // is used, which causes every 0x0A byte in the PCM stream to be
    // translated to 0x0D 0x0A by the C runtime — silently corrupting
    // the audio with static/garbage. Writing to a real file avoids that.
    let out_path = std::env::temp_dir().join(format!(
        "komorebi-piper-{}.wav",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    cmd.arg("--output_file").arg(&out_path);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    // Windows: suppress the transient console window that flashes every time
    // Piper is spawned from a GUI app. CREATE_NO_WINDOW = 0x08000000.
    #[cfg(windows)]
    {
        cmd.creation_flags(0x0800_0000);
    }

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
        let _ = std::fs::remove_file(&out_path);
        return Err(TtsError::PiperExit(code));
    }
    // Read the WAV written to disk (binary-safe), then clean up.
    let wav = std::fs::read(&out_path).map_err(|e| {
        tracing::warn!(?e, path = %out_path.display(), "failed to read piper output");
        TtsError::Audio(format!("failed to read piper output: {e}"))
    })?;
    let _ = std::fs::remove_file(&out_path);
    if wav.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::warn!(stderr = %stderr, "piper produced empty WAV");
        return Err(TtsError::Audio(format!(
            "piper returned no audio (stderr: {stderr})"
        )));
    }
    tracing::debug!(bytes = wav.len(), "piper synthesized");
    // Always log stderr for diagnostics — Piper reports the phonemes it
    // used via stderr when run interactively, which tells us whether the
    // espeak-ng phonemizer is behaving correctly.
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stderr.is_empty() {
        tracing::info!(stderr = %stderr, "piper stderr");
    }
    Ok(wav)
}

async fn play_wav_blocking(wav: Vec<u8>) -> Result<(), TtsError> {
    // rodio's OutputStream is `!Send`, so run the whole playback on a
    // dedicated blocking thread and await completion.
    tokio::task::spawn_blocking(move || -> Result<(), TtsError> {
        use rodio::{Decoder, DeviceSinkBuilder, Player};
        use std::io::Cursor;

        let stream_handle =
            DeviceSinkBuilder::open_default_sink().map_err(|e| TtsError::Audio(e.to_string()))?;
        let sink = Player::connect_new(stream_handle.mixer());
        let decoder =
            Decoder::try_from(Cursor::new(wav)).map_err(|e| TtsError::Audio(e.to_string()))?;
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
