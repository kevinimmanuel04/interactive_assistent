//! Streaming HTTP file downloader with resume support and optional SHA-256 verification.
//!
//! Phase 1B: used for GGUF LLM weights and Piper TTS models.
//! Phase 3+: will back RAG embedding model downloads too.

use futures::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use thiserror::Error;
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadSpec {
    pub url: String,
    pub file_name: String,
    /// Optional SHA-256 of the final file (hex, lowercase).
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DownloadEvent {
    Started {
        file_name: String,
        total: Option<u64>,
        resumed_from: u64,
    },
    Progress {
        file_name: String,
        downloaded: u64,
        total: Option<u64>,
    },
    Verifying {
        file_name: String,
    },
    Finished {
        file_name: String,
        path: String,
    },
    Failed {
        file_name: String,
        message: String,
    },
}

#[derive(Error, Debug)]
pub enum DownloadError {
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("server returned {0}")]
    Status(u16),
    #[error("checksum mismatch (expected {expected}, got {actual})")]
    Checksum { expected: String, actual: String },
}

/// Download a file, resuming if a `.part` is present. Calls `progress` for each
/// chunk so callers can surface UI updates via Tauri events.
pub async fn download_to<F>(
    client: &reqwest::Client,
    spec: &DownloadSpec,
    dest_dir: &Path,
    mut progress: F,
) -> Result<PathBuf, DownloadError>
where
    F: FnMut(DownloadEvent),
{
    fs::create_dir_all(dest_dir).await?;
    let final_path = dest_dir.join(&spec.file_name);
    let part_path = dest_dir.join(format!("{}.part", spec.file_name));

    if final_path.exists() {
        if let Some(expected) = &spec.sha256 {
            progress(DownloadEvent::Verifying {
                file_name: spec.file_name.clone(),
            });
            let actual = sha256_of(&final_path).await?;
            if actual.eq_ignore_ascii_case(expected) {
                progress(DownloadEvent::Finished {
                    file_name: spec.file_name.clone(),
                    path: final_path.to_string_lossy().into_owned(),
                });
                return Ok(final_path);
            }
            // Mismatch — re-download.
            fs::remove_file(&final_path).await.ok();
        } else {
            progress(DownloadEvent::Finished {
                file_name: spec.file_name.clone(),
                path: final_path.to_string_lossy().into_owned(),
            });
            return Ok(final_path);
        }
    }

    let resume_from = match fs::metadata(&part_path).await {
        Ok(m) => m.len(),
        Err(_) => 0,
    };

    let mut req = client.get(&spec.url);
    if resume_from > 0 {
        req = req.header("Range", format!("bytes={resume_from}-"));
    }
    let resp = req.send().await?;
    let status = resp.status();
    if !status.is_success() && status.as_u16() != 206 {
        return Err(DownloadError::Status(status.as_u16()));
    }

    // Total size: content-length + resume_from (if 206 partial content).
    let content_length = resp.content_length();
    let total = content_length.map(|cl| cl + resume_from);

    progress(DownloadEvent::Started {
        file_name: spec.file_name.clone(),
        total,
        resumed_from: resume_from,
    });

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&part_path)
        .await?;

    let mut downloaded = resume_from;
    let mut stream = resp.bytes_stream();
    let mut last_emit = std::time::Instant::now();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;
        if last_emit.elapsed() >= std::time::Duration::from_millis(200) {
            progress(DownloadEvent::Progress {
                file_name: spec.file_name.clone(),
                downloaded,
                total,
            });
            last_emit = std::time::Instant::now();
        }
    }
    file.flush().await?;
    drop(file);

    if let Some(expected) = &spec.sha256 {
        progress(DownloadEvent::Verifying {
            file_name: spec.file_name.clone(),
        });
        let actual = sha256_of(&part_path).await?;
        if !actual.eq_ignore_ascii_case(expected) {
            // Leave the .part in place for diagnostics; user can retry.
            return Err(DownloadError::Checksum {
                expected: expected.clone(),
                actual,
            });
        }
    }

    fs::rename(&part_path, &final_path).await?;
    progress(DownloadEvent::Finished {
        file_name: spec.file_name.clone(),
        path: final_path.to_string_lossy().into_owned(),
    });
    Ok(final_path)
}

async fn sha256_of(path: &Path) -> Result<String, std::io::Error> {
    use tokio::io::AsyncReadExt;
    let mut file = fs::File::open(path).await?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(digest.len() * 2);
    for byte in digest.iter() {
        use std::fmt::Write as _;
        let _ = write!(&mut hex, "{:02x}", byte);
    }
    Ok(hex)
}
