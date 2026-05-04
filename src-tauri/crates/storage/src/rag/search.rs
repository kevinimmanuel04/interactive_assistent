//! BM25 query path. `RagIndex::search` plus the FTS query sanitiser.

use rusqlite::params;

use super::{RagError, RagHit, RagIndex};

impl RagIndex {
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

/// Strip characters that FTS5 treats specially so naive user queries don't
/// trip MATCH syntax errors. Quotes, colons, parens, asterisks — all out.
pub(super) fn sanitize_query(raw: &str) -> String {
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
