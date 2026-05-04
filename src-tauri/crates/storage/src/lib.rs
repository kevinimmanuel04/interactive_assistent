//! Persistence: config snapshots, downloader, RAG index.

pub mod download;
pub mod feedback;
pub mod rag;
pub use download::{download_to, DownloadError, DownloadEvent, DownloadSpec};
pub use feedback::{FeedbackError, FeedbackRecord, FeedbackStats, FeedbackStore};
pub use rag::{FolderStats, IndexReport, RagError, RagHit, RagIndex};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub llm_model_path: Option<String>,
    pub openrouter_model: Option<String>,
    pub hotkey_toggle_input: Option<String>,
}
