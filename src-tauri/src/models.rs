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
