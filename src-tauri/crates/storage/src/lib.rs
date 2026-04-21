//! Persistence: config snapshots, downloader, keyring (future).
//! SQLite chat history + RAG index land in Phase 3.

pub mod download;
pub use download::{download_to, DownloadError, DownloadEvent, DownloadSpec};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub llm_model_path: Option<String>,
    pub openrouter_model: Option<String>,
    pub hotkey_toggle_input: Option<String>,
}
