//! RAG context assembly for chat prompts.

use std::sync::Arc;
use tauri::{AppHandle, Manager, Wry};

/// Query the RAG index for the top chunks matching `prompt` and format
/// them as a system message. Returns `None` if the index is absent, the
/// query is empty, or no chunks match. Bounded at ~6 snippets / 4 KB to
/// keep local-model context windows happy.
pub(super) fn build_rag_context(app: &AppHandle<Wry>, prompt: &str) -> Option<String> {
    let rag = app
        .try_state::<Arc<komorebi_storage::RagIndex>>()?
        .inner()
        .clone();
    let hits = match rag.search(prompt, 6) {
        Ok(h) => h,
        Err(e) => {
            tracing::debug!(?e, "rag search failed");
            return None;
        }
    };
    if hits.is_empty() {
        return None;
    }
    let mut out = String::from(
        "Relevant notes from the user's indexed files. Use them only if they \
         help answer the question; otherwise ignore. Cite file names inline \
         when quoting.\n\n",
    );
    let mut budget = 4096usize;
    for h in hits {
        let entry = format!(
            "— {} —\n{}\n\n",
            std::path::Path::new(&h.path)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or(h.path),
            h.snippet
        );
        if entry.len() > budget {
            break;
        }
        budget -= entry.len();
        out.push_str(&entry);
    }
    Some(out)
}
