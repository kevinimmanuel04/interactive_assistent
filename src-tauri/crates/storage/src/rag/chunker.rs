//! Tunables, file readers, and the chunker.

use std::path::Path;

pub(super) const CHUNK_CHARS: usize = 800;
pub(super) const CHUNK_OVERLAP: usize = 120;
pub(super) const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024; // 2 MB — skip anything bigger.
pub(super) const ALLOWED_EXTS: &[&str] = &[
    "txt", "md", "markdown", "rst", "org", "json", "yaml", "yml", "toml", "csv", "tsv", "log",
    "ini", "cfg", "py", "rs", "ts", "tsx", "js", "jsx", "go", "java", "kt", "swift", "c", "h",
    "cpp", "hpp", "cs", "rb", "php", "sh", "ps1", "sql", "html", "css", "scss",
    // v1.1: PDF support via `pdf-extract`.
    "pdf",
];

#[derive(Debug, Clone)]
pub(super) struct Chunk {
    pub text: String,
    pub start: usize,
    pub end: usize,
}

/// Read a file as plain text, with format-specific extractors. Returns
/// `None` if the file is unreadable, binary, or extraction failed.
pub(super) fn read_indexable(path: &Path) -> Option<String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase());
    match ext.as_deref() {
        Some("pdf") => {
            // pdf-extract is pure Rust; failures here are common (encrypted /
            // image-only PDFs) so we just skip on error rather than logging
            // noise.
            pdf_extract::extract_text(path)
                .ok()
                .filter(|s| !s.trim().is_empty())
        }
        _ => std::fs::read_to_string(path).ok(),
    }
}

pub(super) fn chunk_text(input: &str) -> Vec<Chunk> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    // Character-based windows keep the impl simple while preserving UTF-8.
    let chars: Vec<(usize, char)> = input.char_indices().collect();
    if chars.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        let end = (i + CHUNK_CHARS).min(chars.len());
        let start_byte = chars[i].0;
        let end_byte = if end < chars.len() {
            chars[end].0
        } else {
            input.len()
        };
        let slice = input[start_byte..end_byte].trim();
        if !slice.is_empty() {
            out.push(Chunk {
                text: slice.to_string(),
                start: start_byte,
                end: end_byte,
            });
        }
        if end == chars.len() {
            break;
        }
        i = end.saturating_sub(CHUNK_OVERLAP);
    }
    out
}

pub(super) fn is_indexable(p: &Path) -> bool {
    match p.extension().and_then(|s| s.to_str()) {
        Some(ext) => {
            let lower = ext.to_ascii_lowercase();
            ALLOWED_EXTS.iter().any(|e| *e == lower)
        }
        None => false,
    }
}
