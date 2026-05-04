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
//!
//! Submodules:
//!   * [`chunker`] — file-type whitelist, text extraction (incl. PDF), and
//!     UTF-8-safe overlapping chunker.
//!   * [`schema`]  — `CREATE` batch and small fs/time helpers.
//!   * [`index`]   — `RagIndex::index_folder` / `index_all`.
//!   * [`search`]  — `RagIndex::search` and the FTS query sanitiser.

mod chunker;
mod index;
mod schema;
mod search;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

use schema::{canonicalize, SCHEMA};

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
    /// Visible to sibling modules (`index`, `search`) so they can reach the
    /// shared `Connection` without going through accessor methods.
    pub(super) conn: Mutex<Connection>,
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
}

#[cfg(test)]
mod tests {
    use super::search::sanitize_query;
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn chunk_text_handles_short_input() {
        let c = super::chunker::chunk_text("hello world");
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].text, "hello world");
    }

    #[test]
    fn chunk_text_overlaps() {
        let long: String = "а".repeat(2000);
        let chunks = super::chunker::chunk_text(&long);
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
        let base = std::env::temp_dir().join(format!("komorebi-rag-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        base
    }
}
