//! RAG (retrieval-augmented generation) folder management commands.

use std::sync::Arc;
use tauri::{AppHandle, Manager, State, Wry};

#[tauri::command]
pub fn rag_list_folders(
    rag: State<'_, Arc<komorebi_storage::RagIndex>>,
) -> Result<Vec<komorebi_storage::FolderStats>, String> {
    rag.folders().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rag_add_folder(
    rag: State<'_, Arc<komorebi_storage::RagIndex>>,
    path: String,
) -> Result<(), String> {
    rag.add_folder(std::path::Path::new(&path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rag_remove_folder(
    rag: State<'_, Arc<komorebi_storage::RagIndex>>,
    path: String,
) -> Result<(), String> {
    rag.remove_folder(std::path::Path::new(&path))
        .map_err(|e| e.to_string())
}

/// Re-walks either a single folder (if `path` is given) or every known
/// folder. Runs on a blocking thread so the UI stays responsive.
#[tauri::command]
pub async fn rag_reindex(
    app: AppHandle<Wry>,
    path: Option<String>,
) -> Result<komorebi_storage::IndexReport, String> {
    let rag: Arc<komorebi_storage::RagIndex> = app
        .try_state::<Arc<komorebi_storage::RagIndex>>()
        .ok_or_else(|| "RAG index not initialized".to_string())?
        .inner()
        .clone();
    tokio::task::spawn_blocking(move || {
        if let Some(p) = path {
            rag.index_folder(std::path::Path::new(&p))
        } else {
            rag.index_all()
        }
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}
