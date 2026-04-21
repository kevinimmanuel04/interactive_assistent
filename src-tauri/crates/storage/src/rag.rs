//! Lightweight local RAG index backed by SQLite FTS5.
//!
//! Why FTS5 and not embeddings? Phase 3C ships a retrieval layer that works
//! **offline, instantly, without a gigabyte of ML dependencies**. FTS5's
//! BM25 ranking is already a solid baseline for personal-note retrieval,
//! and the schema (one row per chunk, with file path + byte offsets)
//! leaves room to stack a vector table on top later without data loss.
//!
//! Index layout:
//!   * `folders(path PRIMARY KEY, indexed_at)` — user-configured roots.
//!   * `documents(id, path UNIQUE, mtime, size)` — one row per source file.
//!   * `chunks(doc_id, ord, start, end)` — offset bookkeeping.
//!   * `chunks_fts(text)` — virtual FTS5 table joined by rowid = chunks.rowid.
//!
//! Indexing is synchronous-per-file but parallelism-agnostic: `index_folder`
//! walks with `walkdir`, reads files below `MAX_FILE_BYTES`, skips binary /
//! unknown extensions, and upserts on mtime change.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;
use walkdir::WalkDir;

const CHUNK_CHARS: usize = 800;
const CHUNK_OVERLAP: usize = 120;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024; // 2 MB — skip anything bigger.
const ALLOWED_EXTS: &[&str] = &[
    "txt", "md", "markdown", "rst", "org", "json", "yaml", "yml", "toml",
    "csv", "tsv", "log", "ini", "cfg", "py", "rs", "ts", "tsx", "js", "jsx",
    "go", "java", "kt", "swift", "c", "h", "cpp", "hpp", "cs", "rb", "php",
    "sh", "ps1", "sql", "html", "css", "scss",
];

#[derive(thiserror::Error, Debug)]
pub enum RagError {
    #[error("sqlite: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Other(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagHit {
    pub path: String,
    pub snippet: String,
    /// Lower is better (BM25 rank from SQLite).
    pub score: f64,
    pub ord: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderStats {
    pub path: String,
    pub doc_count: i64,
    pub chunk_count: i64,
    pub indexed_at: Option<i64>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct IndexReport {
    pub files_scanned: u64,
    pub files_indexed: u64,
    pub files_skipped: u64,
    pub chunks_written: u64,
}

pub struct RagIndex {
    conn: Mutex<Connection>,
}

impl RagIndex {
    pub fn open(path: &Path) -> Result<Self, RagError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Add a folder to the watch list (no indexing yet).
    pub fn add_folder(&self, path: &Path) -> Result<(), RagError> {
        let canon = canonicalize(path);
        let conn = self.conn.lock().expect("poisoned");
        conn.execute(
            "INSERT OR IGNORE INTO folders(path, indexed_at) VALUES (?1, NULL)",
            params![canon],
        )?;
        Ok(())
    }

    /// Remove a folder and all of its indexed documents/chunks.
    pub fn remove_folder(&self, path: &Path) -> Result<(), RagError> {
        let canon = canonicalize(path);
        let conn = self.conn.lock().expect("poisoned");
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "DELETE FROM chunks WHERE doc_id IN (SELECT id FROM documents WHERE path LIKE ?1)",
            params![format!("{canon}%")],
        )?;
        tx.execute(
            "DELETE FROM documents WHERE path LIKE ?1",
            params![format!("{canon}%")],
        )?;
        tx.execute("DELETE FROM folders WHERE path = ?1", params![canon])?;
        tx.commit()?;
        Ok(())
    }

    pub fn folders(&self) -> Result<Vec<FolderStats>, RagError> {
        let conn = self.conn.lock().expect("poisoned");
        let mut stmt = conn.prepare(
            "SELECT f.path, f.indexed_at,
                    (SELECT COUNT(*) FROM documents d WHERE d.path LIKE f.path || '%'),
                    (SELECT COUNT(*) FROM chunks c JOIN documents d ON d.id = c.doc_id WHERE d.path LIKE f.path || '%')
             FROM folders f ORDER BY f.path",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(FolderStats {
                    path: r.get(0)?,
                    indexed_at: r.get(1)?,
                    doc_count: r.get(2)?,
                    chunk_count: r.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Re-walk a single folder and upsert changed/new files.
    pub fn index_folder(&self, path: &Path) -> Result<IndexReport, RagError> {
        let canon = canonicalize(path);
        self.add_folder(Path::new(&canon))?;

        let mut report = IndexReport::default();
        for entry in WalkDir::new(&canon)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            report.files_scanned += 1;
            let p = entry.path();
            if !is_indexable(p) {
                report.files_skipped += 1;
                continue;
            }
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => {
                    report.files_skipped += 1;
                    continue;
                }
            };
            if meta.len() > MAX_FILE_BYTES {
                report.files_skipped += 1;
                continue;
            }
            let mtime = mtime_secs(&meta);
            let path_s = p.to_string_lossy().to_string();

            // Skip if unchanged.
            {
                let conn = self.conn.lock().expect("poisoned");
                let existing: Option<(i64, i64)> = conn
                    .query_row(
                        "SELECT id, mtime FROM documents WHERE path = ?1",
                        params![&path_s],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .optional()?;
                if let Some((_id, existing_mtime)) = existing {
                    if existing_mtime == mtime {
                        continue;
                    }
                }
            }

            let text = match std::fs::read_to_string(p) {
                Ok(t) => t,
                Err(_) => {
                    report.files_skipped += 1;
                    continue;
                }
            };
            let chunks = chunk_text(&text);
            if chunks.is_empty() {
                report.files_skipped += 1;
                continue;
            }

            let mut conn = self.conn.lock().expect("poisoned");
            let tx = conn.transaction()?;
            tx.execute(
                "INSERT INTO documents(path, mtime, size)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(path) DO UPDATE SET mtime = excluded.mtime, size = excluded.size",
                params![&path_s, mtime, meta.len() as i64],
            )?;
            let doc_id: i64 = tx.query_row(
                "SELECT id FROM documents WHERE path = ?1",
                params![&path_s],
                |r| r.get(0),
            )?;
            // Drop old chunks + their FTS rows.
            tx.execute("DELETE FROM chunks WHERE doc_id = ?1", params![doc_id])?;
            for (ord, ch) in chunks.iter().enumerate() {
                tx.execute(
                    "INSERT INTO chunks(doc_id, ord, start, end) VALUES (?1, ?2, ?3, ?4)",
                    params![doc_id, ord as i64, ch.start as i64, ch.end as i64],
                )?;
                let rowid = tx.last_insert_rowid();
                tx.execute(
                    "INSERT INTO chunks_fts(rowid, text) VALUES (?1, ?2)",
                    params![rowid, &ch.text],
                )?;
                report.chunks_written += 1;
            }
            tx.commit()?;
            report.files_indexed += 1;
        }

        let conn = self.conn.lock().expect("poisoned");
        conn.execute(
            "UPDATE folders SET indexed_at = ?1 WHERE path = ?2",
            params![now_secs(), canon],
        )?;
        Ok(report)
    }

    /// Re-index every known folder.
    pub fn index_all(&self) -> Result<IndexReport, RagError> {
        let paths: Vec<String> = {
            let conn = self.conn.lock().expect("poisoned");
            let mut stmt = conn.prepare("SELECT path FROM folders")?;
            let collected = stmt
                .query_map([], |r| r.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            collected
        };
        let mut total = IndexReport::default();
        for p in paths {
            let rep = self.index_folder(Path::new(&p))?;
            total.files_scanned += rep.files_scanned;
            total.files_indexed += rep.files_indexed;
            total.files_skipped += rep.files_skipped;
            total.chunks_written += rep.chunks_written;
        }
        Ok(total)
    }

    /// BM25-ranked query. Returns at most `k` hits ordered by score ascending
    /// (FTS5 `rank` is an inverted BM25 score — smaller = better match).
    pub fn search(&self, query: &str, k: usize) -> Result<Vec<RagHit>, RagError> {
        let clean = sanitize_query(query);
        if clean.is_empty() {
            return Ok(Vec::new());
        }
        let conn = self.conn.lock().expect("poisoned");
        let mut stmt = conn.prepare(
            "SELECT d.path, snippet(chunks_fts, 0, '«', '»', ' … ', 20) AS snip,
                    bm25(chunks_fts) AS score, c.ord
             FROM chunks_fts
             JOIN chunks c ON c.rowid = chunks_fts.rowid
             JOIN documents d ON d.id = c.doc_id
             WHERE chunks_fts MATCH ?1
             ORDER BY score ASC
             LIMIT ?2",
        )?;
        let rows = stmt
            .query_map(params![clean, k as i64], |r| {
                Ok(RagHit {
                    path: r.get(0)?,
                    snippet: r.get(1)?,
                    score: r.get(2)?,
                    ord: r.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }
}

// --- helpers ---------------------------------------------------------------

const SCHEMA: &str = r#"
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

#[derive(Debug, Clone)]
struct Chunk {
    text: String,
    start: usize,
    end: usize,
}

fn chunk_text(input: &str) -> Vec<Chunk> {
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

fn is_indexable(p: &Path) -> bool {
    match p.extension().and_then(|s| s.to_str()) {
        Some(ext) => {
            let lower = ext.to_ascii_lowercase();
            ALLOWED_EXTS.iter().any(|e| *e == lower)
        }
        None => false,
    }
}

fn mtime_secs(meta: &std::fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn canonicalize(p: &Path) -> String {
    std::fs::canonicalize(p)
        .unwrap_or_else(|_| PathBuf::from(p))
        .to_string_lossy()
        .to_string()
}

/// Strip characters that FTS5 treats specially so naive user queries don't
/// trip MATCH syntax errors. Quotes, colons, parens, asterisks — all out.
fn sanitize_query(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c.is_whitespace() || c == '-' || c == '_' {
                c
            } else {
                ' '
            }
        })
        .collect();
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunk_text_handles_short_input() {
        let c = chunk_text("hello world");
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].text, "hello world");
    }

    #[test]
    fn chunk_text_overlaps() {
        let long: String = "а".repeat(2000);
        let chunks = chunk_text(&long);
        assert!(chunks.len() >= 2);
        // Consecutive chunks overlap by CHUNK_OVERLAP characters worth of bytes.
        for w in chunks.windows(2) {
            assert!(w[1].start < w[0].end);
        }
    }

    #[test]
    fn sanitize_strips_fts_syntax() {
        assert_eq!(sanitize_query("foo:bar \"baz\""), "foo bar baz");
        assert_eq!(sanitize_query("a AND b"), "a AND b");
        assert_eq!(sanitize_query("  "), "");
    }

    #[test]
    fn in_memory_round_trip() {
        let dir = tempdir_simple();
        let db = dir.join("rag.db");
        let src = dir.join("notes");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(
            src.join("hello.md"),
            "# Komorebi\nKomorebi is a desktop virtual assistant.\n",
        )
        .unwrap();
        std::fs::write(
            src.join("other.md"),
            "Unrelated content about tea and rainy afternoons.\n",
        )
        .unwrap();

        let rag = RagIndex::open(&db).unwrap();
        let rep = rag.index_folder(&src).unwrap();
        assert_eq!(rep.files_indexed, 2);

        let hits = rag.search("komorebi assistant", 5).unwrap();
        assert!(!hits.is_empty());
        assert!(hits[0].path.ends_with("hello.md"));

        // Re-index is a no-op when mtimes are unchanged.
        let rep2 = rag.index_folder(&src).unwrap();
        assert_eq!(rep2.files_indexed, 0);

        // Removing the folder wipes documents.
        rag.remove_folder(&src).unwrap();
        assert!(rag.search("komorebi", 5).unwrap().is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }

    fn tempdir_simple() -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "komorebi-rag-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        base
    }
}
