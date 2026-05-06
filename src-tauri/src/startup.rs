//! One-time post-builder initialization: register hotkeys, install tray,
//! open the RAG index, kick off the proactive/coach loops, etc.

use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::feedback;
use crate::tray;

/// Runs every startup task that needs the fully-built `App` (state,
/// handles, paths, …). Errors that aren't fatal to the app are logged
/// and swallowed; only truly unrecoverable ones are propagated.
pub(crate) fn run(
    app: &mut tauri::App,
    toggle_input: Shortcut,
    vision_region: Shortcut,
) -> Result<(), Box<dyn std::error::Error>> {
    app.global_shortcut().register(toggle_input)?;
    if let Err(e) = app.global_shortcut().register(vision_region) {
        tracing::warn!(?e, "failed to register Alt+V hotkey");
    }

    // Phase 1: spawn the feedback-telemetry uploader. Runs even when
    // the user hasn't opted in — it's a no-op until the toggle is
    // flipped, then drains the local queue periodically.
    feedback::spawn_uploader(app.handle().clone());

    tray::install(app)?;

    // Initialize the RAG index in the app's data dir and stash it on
    // the Tauri state map.
    match app.path().app_data_dir() {
        Ok(dir) => {
            let db = dir.join("rag.db");
            match komorebi_storage::RagIndex::open(&db) {
                Ok(idx) => {
                    app.manage(Arc::new(idx));
                    tracing::info!(?db, "RAG index opened");
                }
                Err(e) => tracing::warn!(?e, "failed to open RAG index"),
            }
        }
        Err(e) => tracing::warn!(?e, "app_data_dir unavailable; RAG disabled"),
    }

    // Apply persisted TTS config to the shared handle.
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        crate::commands::reload_tts(&handle).await;
    });

    // Proactive agent — polls active window/processes and nudges the
    // user when appropriate (only if enabled in settings).
    crate::proactive::spawn(app.handle().clone());
    crate::coach::spawn(app.handle().clone());

    // Local intent classifier: if the user has previously downloaded
    // the embedding model (cache dir exists), warm it up in the
    // background. Otherwise stay dormant — the model is opt-in and
    // only fetched when the user explicitly invokes `intent_load`.
    if let Ok(data_dir) = app.path().app_data_dir() {
        let intent_cache = data_dir.join("intent");
        if intent_cache.exists()
            && std::fs::read_dir(&intent_cache)
                .map(|mut d| d.next().is_some())
                .unwrap_or(false)
        {
            if let Some(state) = app.try_state::<std::sync::Arc<crate::intent::IntentState>>() {
                let state = state.inner().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = state.load(intent_cache).await {
                        tracing::warn!(?e, "intent classifier auto-load failed");
                    } else {
                        tracing::info!("intent classifier ready");
                    }
                });
            }
        }
    }

    tracing::info!("Komorebi started");
    Ok(())
}
