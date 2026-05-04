//! Local feedback queue for thumbs-up/down ratings on assistant replies.
//!
//! Phase 1 of the federated-personality roadmap: collect anonymized
//! 👍/👎 signals locally, hash prompt/response so raw text never has to
//! leave the device, and let an opt-in uploader drain the queue to the
//! community telemetry endpoint.
//!
//! What is *intentionally* not stored:
//!   * raw prompt / response text (only sha256 hex);
//!   * timestamps with sub-day resolution (we round to the day at upload);
//!   * any identifier that links rows to the user (only an opaque
//!     install-token chosen by the user, rotatable).
//!
//! Schema:
//!   feedback(id, created_at, model_label, route, prompt_hash, response_hash,
//!            response_chars, rating, lang, uploaded_at)
//!
//! `uploaded_at IS NULL` means "still in queue". Rows are kept after
//! upload (so the user can see history and revoke), and purged on
//! explicit user action.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(thiserror::Error, Debug)]
pub enum FeedbackError {
    #[error("sqlite: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackRecord {
    pub id: i64,
    pub created_at: i64,
    pub model_label: String,
    pub route: String,
    pub prompt_hash: String,
    pub response_hash: String,
    pub response_chars: i64,
    /// `+1` for thumbs-up, `-1` for thumbs-down.
    pub rating: i32,
    pub lang: String,
    pub uploaded_at: Option<i64>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct FeedbackStats {
    pub pending: i64,
    pub uploaded: i64,
}

pub struct FeedbackStore {
    conn: Mutex<Connection>,
}

impl FeedbackStore {
    pub fn open(path: &Path) -> Result<Self, FeedbackError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Hash a prompt or response with sha256 → hex. Public so callers can
    /// pre-compute hashes, but [`record`] also accepts raw strings via
    /// [`record_raw`].
    pub fn hash(text: &str) -> String {
        let mut h = Sha256::new();
        h.update(text.as_bytes());
        let bytes = h.finalize();
        // hex without an extra dependency: 64 chars is fine to format.
        let mut s = String::with_capacity(64);
        for b in bytes.iter() {
            s.push_str(&format!("{:02x}", b));
        }
        s
    }

    /// Insert a new record from raw prompt/response text (text is hashed
    /// and dropped — never persisted). Returns the row id.
    #[allow(clippy::too_many_arguments)]
    pub fn record_raw(
        &self,
        model_label: &str,
        route: &str,
        prompt: &str,
        response: &str,
        rating: i32,
        lang: &str,
    ) -> Result<i64, FeedbackError> {
        let prompt_hash = Self::hash(prompt);
        let response_hash = Self::hash(response);
        let response_chars = response.chars().count() as i64;
        let now = unix_now();
        let conn = self.conn.lock().expect("poisoned");
        conn.execute(
            "INSERT INTO feedback(created_at, model_label, route, prompt_hash, response_hash, response_chars, rating, lang) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                now,
                model_label,
                route,
                prompt_hash,
                response_hash,
                response_chars,
                rating,
                lang,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn pending(&self, limit: i64) -> Result<Vec<FeedbackRecord>, FeedbackError> {
        let conn = self.conn.lock().expect("poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, created_at, model_label, route, prompt_hash, response_hash, \
                    response_chars, rating, lang, uploaded_at \
             FROM feedback WHERE uploaded_at IS NULL ORDER BY created_at ASC LIMIT ?1",
        )?;
        let rows = stmt
            .query_map(params![limit], row_to_record)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn mark_uploaded(&self, ids: &[i64]) -> Result<(), FeedbackError> {
        if ids.is_empty() {
            return Ok(());
        }
        let now = unix_now();
        let conn = self.conn.lock().expect("poisoned");
        let tx = conn.unchecked_transaction()?;
        {
            let mut stmt = tx.prepare("UPDATE feedback SET uploaded_at = ?1 WHERE id = ?2")?;
            for id in ids {
                stmt.execute(params![now, id])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn stats(&self) -> Result<FeedbackStats, FeedbackError> {
        let conn = self.conn.lock().expect("poisoned");
        let pending: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM feedback WHERE uploaded_at IS NULL",
                [],
                |r| r.get(0),
            )
            .optional()?
            .unwrap_or(0);
        let uploaded: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM feedback WHERE uploaded_at IS NOT NULL",
                [],
                |r| r.get(0),
            )
            .optional()?
            .unwrap_or(0);
        Ok(FeedbackStats { pending, uploaded })
    }

    /// Wipe all feedback (queue + history). User-initiated, irreversible.
    pub fn purge(&self) -> Result<i64, FeedbackError> {
        let conn = self.conn.lock().expect("poisoned");
        let n = conn.execute("DELETE FROM feedback", [])? as i64;
        Ok(n)
    }
}

fn row_to_record(row: &rusqlite::Row) -> rusqlite::Result<FeedbackRecord> {
    Ok(FeedbackRecord {
        id: row.get(0)?,
        created_at: row.get(1)?,
        model_label: row.get(2)?,
        route: row.get(3)?,
        prompt_hash: row.get(4)?,
        response_hash: row.get(5)?,
        response_chars: row.get(6)?,
        rating: row.get(7)?,
        lang: row.get(8)?,
        uploaded_at: row.get(9)?,
    })
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS feedback (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at      INTEGER NOT NULL,
    model_label     TEXT NOT NULL,
    route           TEXT NOT NULL,
    prompt_hash     TEXT NOT NULL,
    response_hash   TEXT NOT NULL,
    response_chars  INTEGER NOT NULL,
    rating          INTEGER NOT NULL,
    lang            TEXT NOT NULL,
    uploaded_at     INTEGER
);
CREATE INDEX IF NOT EXISTS feedback_pending_idx
    ON feedback(uploaded_at) WHERE uploaded_at IS NULL;
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let store = FeedbackStore::open(&dir.path().join("fb.sqlite")).unwrap();
        let id = store
            .record_raw("openrouter:x", "cloud", "hi", "hello", 1, "en")
            .unwrap();
        assert!(id > 0);
        let st = store.stats().unwrap();
        assert_eq!(st.pending, 1);
        let p = store.pending(10).unwrap();
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].rating, 1);
        store.mark_uploaded(&[id]).unwrap();
        let st = store.stats().unwrap();
        assert_eq!(st.pending, 0);
        assert_eq!(st.uploaded, 1);
    }
}
