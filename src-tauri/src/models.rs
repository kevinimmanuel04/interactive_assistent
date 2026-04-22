//! Model asset manifest + download orchestration for the first-run wizard.
//!
//! Resolves the app-data models directory, exposes a catalog of known assets,
//! and invokes the shared downloader from `komorebi_storage`.
//!
//! SHA-256 digests are intentionally optional in Phase 1B: we verify when we
//! know the digest (pinned official releases) and skip when the upstream
//! doesn't publish one. Security note: HTTPS-only URLs.

use komorebi_storage::{DownloadEvent, DownloadSpec};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, Wry};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    LlmGguf,
    PiperVoice,
    PiperConfig,
    WhisperGgml,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Asset {
    pub id: String,
    pub kind: AssetKind,
    pub title: String,
    pub description: String,
    pub url: String,
    pub file_name: String,
    pub approx_size_mb: u64,
    pub sha256: Option<String>,
}

pub fn catalog() -> Vec<Asset> {
    vec![
        Asset {
            id: "llama-3.2-3b-q4".into(),
            kind: AssetKind::LlmGguf,
            title: "Llama 3.2 3B Instruct (Q4_K_M)".into(),
            description: "Default local model — good balance of quality and speed.".into(),
            url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf?download=true".into(),
            file_name: "Llama-3.2-3B-Instruct-Q4_K_M.gguf".into(),
            approx_size_mb: 2020,
            sha256: None,
        },
        Asset {
            id: "llama-3.2-1b-q4".into(),
            kind: AssetKind::LlmGguf,
            title: "Llama 3.2 1B Instruct (Q4_K_M)".into(),
            description: "Smaller, faster fallback for low-end machines.".into(),
            url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf?download=true".into(),
            file_name: "Llama-3.2-1B-Instruct-Q4_K_M.gguf".into(),
            approx_size_mb: 770,
            sha256: None,
        },
        Asset {
            id: "piper-en-amy".into(),
            kind: AssetKind::PiperVoice,
            title: "Piper voice — en_US Amy (medium)".into(),
            description: "Default English voice for Piper TTS.".into(),
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx?download=true".into(),
            file_name: "en_US-amy-medium.onnx".into(),
            approx_size_mb: 63,
            sha256: None,
        },
        Asset {
            id: "piper-en-amy-cfg".into(),
            kind: AssetKind::PiperConfig,
            title: "Piper voice config — en_US Amy".into(),
            description: "Phoneme metadata paired with the voice model.".into(),
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json?download=true".into(),
            file_name: "en_US-amy-medium.onnx.json".into(),
            approx_size_mb: 1,
            sha256: None,
        },
        // --- Russian ---
        Asset {
            id: "piper-ru-irina".into(),
            kind: AssetKind::PiperVoice,
            title: "Piper voice — ru_RU Irina (medium)".into(),
            description: "Russian female voice — warm and clear.".into(),
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx?download=true".into(),
            file_name: "ru_RU-irina-medium.onnx".into(),
            approx_size_mb: 63,
            sha256: None,
        },
        Asset {
            id: "piper-ru-irina-cfg".into(),
            kind: AssetKind::PiperConfig,
            title: "Piper voice config — ru_RU Irina".into(),
            description: "Phoneme metadata paired with the ru_RU-irina voice.".into(),
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx.json?download=true".into(),
            file_name: "ru_RU-irina-medium.onnx.json".into(),
            approx_size_mb: 1,
            sha256: None,
        },
        // --- Ukrainian ---
        Asset {
            id: "piper-uk-lada".into(),
            kind: AssetKind::PiperVoice,
            title: "Piper voice — uk_UA Lada (x_low)".into(),
            description: "Ukrainian female voice — light and friendly.".into(),
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/lada/x_low/uk_UA-lada-x_low.onnx?download=true".into(),
            file_name: "uk_UA-lada-x_low.onnx".into(),
            approx_size_mb: 20,
            sha256: None,
        },
        Asset {
            id: "piper-uk-lada-cfg".into(),
            kind: AssetKind::PiperConfig,
            title: "Piper voice config — uk_UA Lada".into(),
            description: "Phoneme metadata paired with the uk_UA-lada voice.".into(),
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/lada/x_low/uk_UA-lada-x_low.onnx.json?download=true".into(),
            file_name: "uk_UA-lada-x_low.onnx.json".into(),
            approx_size_mb: 1,
            sha256: None,
        },
        // --- "Anime-like" voices ---
        // Piper has no true anime voices, but HFC Female is bright and youthful,
        // and the Japanese voices give an authentic JP timbre. Combined with a
        // tweaked `length_scale` in the onnx.json config (≈0.85), HFC Female
        // lands close to the typical cheerful / genki anime register.
        Asset {
            id: "piper-en-hfc-female".into(),
            kind: AssetKind::PiperVoice,
            title: "Piper voice — en_US HFC Female (medium) · anime-ish".into(),
            description: "Bright, youthful English female voice. Closest to kawaii/anime in the Piper catalog.".into(),
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/hfc_female/medium/en_US-hfc_female-medium.onnx?download=true".into(),
            file_name: "en_US-hfc_female-medium.onnx".into(),
            approx_size_mb: 63,
            sha256: None,
        },
        Asset {
            id: "piper-en-hfc-female-cfg".into(),
            kind: AssetKind::PiperConfig,
            title: "Piper voice config — en_US HFC Female".into(),
            description: "Phoneme metadata paired with the en_US-hfc_female voice.".into(),
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/hfc_female/medium/en_US-hfc_female-medium.onnx.json?download=true".into(),
            file_name: "en_US-hfc_female-medium.onnx.json".into(),
            approx_size_mb: 1,
            sha256: None,
        },
        Asset {
            id: "piper-ja-test".into(),
            kind: AssetKind::PiperVoice,
            title: "Piper voice — ja_JP (medium) · japanese".into(),
            description: "Japanese female voice. Authentic JP timbre for anime-style speech (JP text only).".into(),
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ja/ja_JP/test/medium/ja_JP-test-medium.onnx?download=true".into(),
            file_name: "ja_JP-test-medium.onnx".into(),
            approx_size_mb: 63,
            sha256: None,
        },
        Asset {
            id: "piper-ja-test-cfg".into(),
            kind: AssetKind::PiperConfig,
            title: "Piper voice config — ja_JP".into(),
            description: "Phoneme metadata paired with the ja_JP voice.".into(),
            url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ja/ja_JP/test/medium/ja_JP-test-medium.onnx.json?download=true".into(),
            file_name: "ja_JP-test-medium.onnx.json".into(),
            approx_size_mb: 1,
            sha256: None,
        },
        Asset {
            id: "whisper-tiny-en".into(),
            kind: AssetKind::WhisperGgml,
            title: "Whisper tiny.en (ggml)".into(),
            description: "Smallest English STT model (~75 MB). Fast, decent quality.".into(),
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin?download=true".into(),
            file_name: "ggml-tiny.en.bin".into(),
            approx_size_mb: 75,
            sha256: None,
        },
        Asset {
            id: "whisper-base-en".into(),
            kind: AssetKind::WhisperGgml,
            title: "Whisper base.en (ggml)".into(),
            description: "Better English accuracy (~142 MB). Recommended default.".into(),
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin?download=true".into(),
            file_name: "ggml-base.en.bin".into(),
            approx_size_mb: 142,
            sha256: None,
        },
        // --- Multilingual STT (RU/EN/UK and more) ---
        Asset {
            id: "whisper-base-multi".into(),
            kind: AssetKind::WhisperGgml,
            title: "Whisper base (multilingual, ggml)".into(),
            description: "Multilingual STT — recognises RU / EN / UK and 90+ more languages (~142 MB).".into(),
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin?download=true".into(),
            file_name: "ggml-base.bin".into(),
            approx_size_mb: 142,
            sha256: None,
        },
        Asset {
            id: "whisper-small-multi".into(),
            kind: AssetKind::WhisperGgml,
            title: "Whisper small (multilingual, ggml)".into(),
            description: "Higher-accuracy multilingual STT (~466 MB). Slower but much better for RU/UK.".into(),
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true".into(),
            file_name: "ggml-small.bin".into(),
            approx_size_mb: 466,
            sha256: None,
        },
    ]
}

pub fn models_dir(app: &AppHandle<Wry>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn asset_path(app: &AppHandle<Wry>, asset: &Asset) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(&asset.file_name))
}

#[derive(Debug, Clone, Serialize)]
pub struct AssetStatus {
    pub id: String,
    pub installed: bool,
    pub path: Option<String>,
}

pub fn statuses(app: &AppHandle<Wry>) -> Vec<AssetStatus> {
    catalog()
        .into_iter()
        .map(|a| {
            let path = asset_path(app, &a).ok();
            let installed = path.as_ref().map(|p| p.exists()).unwrap_or(false);
            AssetStatus {
                id: a.id,
                installed,
                path: if installed {
                    path.map(|p| p.to_string_lossy().into_owned())
                } else {
                    None
                },
            }
        })
        .collect()
}

pub fn find(asset_id: &str) -> Option<Asset> {
    catalog().into_iter().find(|a| a.id == asset_id)
}

/// Kick off a background download. Emits `models:progress` events with the
/// shared `DownloadEvent` shape so the frontend can render a progress bar.
pub fn spawn_download(app: AppHandle<Wry>, asset: Asset) {
    tauri::async_runtime::spawn(async move {
        let dir = match models_dir(&app) {
            Ok(d) => d,
            Err(e) => {
                let _ = app.emit(
                    "models:progress",
                    DownloadEvent::Failed {
                        file_name: asset.file_name.clone(),
                        message: e,
                    },
                );
                return;
            }
        };
        let client = match reqwest::Client::builder()
            .user_agent(concat!("komorebi/", env!("CARGO_PKG_VERSION")))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit(
                    "models:progress",
                    DownloadEvent::Failed {
                        file_name: asset.file_name.clone(),
                        message: e.to_string(),
                    },
                );
                return;
            }
        };
        let spec = DownloadSpec {
            url: asset.url.clone(),
            file_name: asset.file_name.clone(),
            sha256: asset.sha256.clone(),
        };
        let app_for_cb = app.clone();
        let result = komorebi_storage::download_to(&client, &spec, &dir, move |evt| {
            let _ = app_for_cb.emit("models:progress", evt);
        })
        .await;
        if let Err(e) = result {
            let _ = app.emit(
                "models:progress",
                DownloadEvent::Failed {
                    file_name: asset.file_name.clone(),
                    message: e.to_string(),
                },
            );
        }
    });
}
