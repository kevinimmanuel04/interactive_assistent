//! Proactive agent loop.
//!
//! Runs in the background and, when the user has been idle in the chat for
//! a while AND context allows it (e.g. a game is running → offer tips),
//! emits a "proactive:suggest" event with a short message the assistant
//! voices/types to the user. Kept deliberately simple — no LLM call on
//! every tick. When the user opts in and a proactive event is triggered,
//! the main chat pipeline will be used to turn the hint into a full reply.

use crate::settings;
use komorebi_desktop::{procs, AppKind};
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Wry};

// Shared "last user activity" timestamp (unix seconds). Bumped whenever
// the user sends a chat message or voice input.
static LAST_INTERACTION: AtomicI64 = AtomicI64::new(0);

pub fn bump_last_interaction() {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    LAST_INTERACTION.store(ts, Ordering::Relaxed);
}

fn seconds_since_last() -> i64 {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let last = LAST_INTERACTION.load(Ordering::Relaxed);
    if last == 0 {
        0
    } else {
        now - last
    }
}

#[derive(serde::Serialize, Clone)]
pub struct ProactivePayload {
    pub context: String,
    pub hint: String,
}

/// Spawn the background loop. Polls every ~30 s; fires at most one
/// suggestion per ~10 min window to avoid nagging the user.
pub fn spawn(app: AppHandle<Wry>) {
    bump_last_interaction();
    tauri::async_runtime::spawn(async move {
        let mut last_fired = Instant::now()
            .checked_sub(Duration::from_secs(600))
            .unwrap_or_else(Instant::now);
        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;
            if !settings::get_proactive_enabled(&app) {
                continue;
            }
            if last_fired.elapsed() < Duration::from_secs(600) {
                continue;
            }
            let idle = seconds_since_last();
            if idle < 180 {
                // User interacted less than 3 min ago — let them breathe.
                continue;
            }

            let active = procs::active_window();
            let gaming = active
                .as_ref()
                .map(|w| w.kind == AppKind::Game || w.is_fullscreen)
                .unwrap_or(false);

            let (ctx, hint) = match (&active, gaming) {
                (Some(w), true) => (
                    format!("Gaming: {} ({})", w.title, w.process_name),
                    format!(
                        "I see you're playing {}. Want a quick tip or a break reminder?",
                        w.process_name
                    ),
                ),
                (Some(w), false) if w.kind == AppKind::Ide => (
                    format!("Coding in {}", w.process_name),
                    "Stuck on something? I can help with the code.".into(),
                ),
                (Some(w), false) if w.kind == AppKind::Browser => (
                    format!("Browsing: {}", w.title),
                    "Need a summary of what you're reading?".into(),
                ),
                (Some(w), false) if idle > 900 => (
                    format!("Idle near {}", w.process_name),
                    "You've been quiet for a while — anything I can help with?".into(),
                ),
                _ if idle > 1800 => (
                    "Long idle".into(),
                    "Hey, I'm still here if you need me.".into(),
                ),
                _ => continue,
            };

            let _ = app.emit(
                "proactive:suggest",
                ProactivePayload {
                    context: ctx,
                    hint: hint.clone(),
                },
            );
            last_fired = Instant::now();
            tracing::info!(hint = %hint, "proactive suggestion emitted");
        }
    });
}
