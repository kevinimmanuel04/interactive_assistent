//! Walking a folder tree and upserting documents/chunks. Lives in a
//! separate file because it's the heaviest method on `RagIndex`.

use rusqlite::{params, OptionalExtension};
use std::path::Path;
use walkdir::WalkDir;

use super::chunker::{chunk_text, is_indexable, read_indexable, MAX_FILE_BYTES};
use super::schema::{canonicalize, mtime_secs, now_secs};
use super::{IndexReport, RagError, RagIndex};

impl RagIndex {
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

            let text = match read_indexable(p) {
                Some(t) => t,
                None => {
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
}
