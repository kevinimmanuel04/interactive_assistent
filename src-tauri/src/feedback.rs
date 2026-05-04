//! Phase-1 feedback telemetry plumbing.
//!
//! Owns a single [`komorebi_storage::FeedbackStore`] instance (lazy
//! per-process), exposes high-level helpers for `commands.rs`, and runs
//! a background uploader that drains the local queue when the user has
//! opted into telemetry.
//!
//! The uploader is intentionally *very* conservative:
//!   * fires every [`UPLOAD_INTERVAL_SECS`] seconds, only if the toggle
//!     is on and the queue is non-empty;
//!   * sends rounded-to-day timestamps and an opaque per-install token —
//!     never an identifier;
//!   * batches up to [`UPLOAD_BATCH`] records per HTTP request;
//!   * marks rows as uploaded only on a 2xx response.
//!
//! No raw prompt/response text is stored or transmitted — only sha256
//! hashes (see [`komorebi_storage::feedback`]).

use komorebi_storage::{FeedbackError, FeedbackRecord, FeedbackStats, FeedbackStore};
use once_cell::sync::OnceCell;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager, Wry};

const UPLOAD_INTERVAL_SECS: u64 = 600; // 10 min
const UPLOAD_BATCH: i64 = 200;

static STORE: OnceCell<Arc<FeedbackStore>> = OnceCell::new();

fn store_path(app: &AppHandle<Wry>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    Ok(dir.join("feedback.sqlite"))
}

/// Returns the process-wide feedback store, opening it lazily.
pub fn get_store(app: &AppHandle<Wry>) -> Result<Arc<FeedbackStore>, String> {
    if let Some(s) = STORE.get() {
        return Ok(s.clone());
    }
    let path = store_path(app)?;
    let s = Arc::new(FeedbackStore::open(&path).map_err(|e: FeedbackError| e.to_string())?);
    let _ = STORE.set(s.clone());
    Ok(s)
}

/// Record a single 👍/👎. `rating` is `+1` or `-1` (other values are
/// rejected to keep the schema honest).
#[allow(clippy::too_many_arguments)]
pub fn record(
    app: &AppHandle<Wry>,
    model_label: &str,
    route: &str,
    prompt: &str,
    response: &str,
    rating: i32,
    lang: &str,
) -> Result<i64, String> {
    if rating != 1 && rating != -1 {
        return Err("rating must be +1 or -1".into());
    }
    let store = get_store(app)?;
    store
        .record_raw(model_label, route, prompt, response, rating, lang)
        .map_err(|e| e.to_string())
}

pub fn stats(app: &AppHandle<Wry>) -> Result<FeedbackStats, String> {
    let store = get_store(app)?;
    store.stats().map_err(|e| e.to_string())
}

pub fn purge(app: &AppHandle<Wry>) -> Result<i64, String> {
    let store = get_store(app)?;
    store.purge().map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
struct UploadEnvelope<'a> {
    schema: &'a str,
    anon_token: &'a str,
    client_version: &'a str,
    items: Vec<UploadItem<'a>>,
}

#[derive(Debug, Serialize)]
struct UploadItem<'a> {
    /// Day-resolution unix epoch (rounded to UTC midnight) to preserve
    /// k-anonymity and discourage timing analysis.
    day: i64,
    model_label: &'a str,
    route: &'a str,
    prompt_hash: &'a str,
    response_hash: &'a str,
    response_chars: i64,
    rating: i32,
    lang: &'a str,
}

const SCHEMA_VERSION: &str = "feedback.v1";

fn round_to_day(ts: i64) -> i64 {
    const SECS_PER_DAY: i64 = 86_400;
    (ts / SECS_PER_DAY) * SECS_PER_DAY
}

fn build_envelope<'a>(
    anon_token: &'a str,
    client_version: &'a str,
    rows: &'a [FeedbackRecord],
) -> UploadEnvelope<'a> {
    UploadEnvelope {
        schema: SCHEMA_VERSION,
        anon_token,
        client_version,
        items: rows
            .iter()
            .map(|r| UploadItem {
                day: round_to_day(r.created_at),
                model_label: &r.model_label,
                route: &r.route,
                prompt_hash: &r.prompt_hash,
                response_hash: &r.response_hash,
                response_chars: r.response_chars,
                rating: r.rating,
                lang: &r.lang,
            })
            .collect(),
    }
}

/// Spawns the uploader loop on the Tokio runtime managed by Tauri.
/// Safe to call once during `setup`.
pub fn spawn_uploader(app: AppHandle<Wry>) {
    tauri::async_runtime::spawn(async move {
        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(?e, "feedback uploader: failed to build http client");
                return;
            }
        };
        let version = env!("CARGO_PKG_VERSION").to_string();
        loop {
            tokio::time::sleep(Duration::from_secs(UPLOAD_INTERVAL_SECS)).await;
            if let Err(e) = upload_once(&app, &client, &version).await {
                tracing::debug!(?e, "feedback uploader tick");
            }
        }
    });
}

async fn upload_once(
    app: &AppHandle<Wry>,
    client: &reqwest::Client,
    version: &str,
) -> Result<(), String> {
    if !crate::settings::get_telemetry_enabled(app) {
        return Ok(());
    }
    let endpoint = crate::settings::get_telemetry_endpoint(app);
    if endpoint.trim().is_empty() {
        return Ok(());
    }
    let store = get_store(app)?;
    let rows = store.pending(UPLOAD_BATCH).map_err(|e| e.to_string())?;
    if rows.is_empty() {
        return Ok(());
    }
    let anon = crate::settings::ensure_anon_token(app).map_err(|e| e.to_string())?;
    let envelope = build_envelope(&anon, version, &rows);
    let resp = client
        .post(&endpoint)
        .json(&envelope)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("upload failed: {}", resp.status()));
    }
    let ids: Vec<i64> = rows.iter().map(|r| r.id).collect();
    store.mark_uploaded(&ids).map_err(|e| e.to_string())?;
    tracing::info!(uploaded = ids.len(), "feedback uploaded");
    Ok(())
}
