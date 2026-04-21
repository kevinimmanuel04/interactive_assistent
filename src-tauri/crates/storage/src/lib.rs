//! Persistence: SQLite (chat history, RAG index), keyring (secrets), config.
//! Implemented in Phase 1+.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub llm_model_path: Option<String>,
    pub openrouter_model: Option<String>,
    pub hotkey_toggle_input: Option<String>,
}
