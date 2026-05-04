//! SQL schema (one big `CREATE` batch) and small filesystem/time helpers
//! shared across the index and search code paths.

use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub(super) const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS folders (
    path        TEXT PRIMARY KEY,
    indexed_at  INTEGER
);
CREATE TABLE IF NOT EXISTS documents (
    id     INTEGER PRIMARY KEY,
    path   TEXT UNIQUE NOT NULL,
    mtime  INTEGER NOT NULL,
    size   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
    rowid   INTEGER PRIMARY KEY,
    doc_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    ord     INTEGER NOT NULL,
    start   INTEGER NOT NULL,
    "end"   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_doc_idx ON chunks(doc_id);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    text,
    tokenize = 'unicode61 remove_diacritics 2'
);
-- Keep FTS in sync when chunks are deleted directly. Inserts go through
-- the code path above which writes to chunks_fts explicitly.
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
    DELETE FROM chunks_fts WHERE rowid = old.rowid;
END;
"#;

pub(super) fn mtime_secs(meta: &std::fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub(super) fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub(super) fn canonicalize(p: &Path) -> String {
    std::fs::canonicalize(p)
        .unwrap_or_else(|_| PathBuf::from(p))
        .to_string_lossy()
        .to_string()
}
