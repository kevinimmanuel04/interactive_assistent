//! Relationship / affinity system.
//!
//! Tracks how the user has been treating Komorebi over time. The state is
//! a small JSON blob persisted via `tauri-plugin-store`; SQLite is overkill
//! for one-row + a small event log.
//!
//! Layout:
//! * [`stage`]   — `Stage` enum and score thresholds.
//! * [`state`]   — persisted `State` + `Event` types and storage helpers
//!   ([`state::load`], [`state::save`], [`state::reset`]).
//! * [`scoring`] — turn one user message into scored events.
//! * [`prompts`] — system-prompt persona fragments and stylistic helpers
//!   ([`system_prompt_addition`]).
//! * [`intro`]   — name extraction ([`extract_self_introduction`]).
//!
//! This module owns the two reducer entry points:
//! * [`apply_user_message`] — score a user turn and update the persisted
//!   state in one shot. Emits `relationship:updated`
//!   (and `relationship:stage-change` on rank-up).
//! * [`apply_decay`] — daily-tick reducer, called by the proactive scheduler.

mod intro;
mod prompts;
mod scoring;
mod stage;
mod state;

pub use intro::extract_self_introduction;
#[allow(unused_imports)]
pub use prompts::{mood_bias_for_stage, system_prompt_addition, tts_warmth_multiplier};
#[allow(unused_imports)]
pub use stage::Stage;
#[allow(unused_imports)]
pub use state::{load, reset, save, Event, State};

use tauri::{AppHandle, Emitter, Wry};

use crate::settings;
use state::now_secs;

/// Apply a user message to the state. Persists, emits events. Returns the
/// updated state for further use (e.g. by the chat pipeline to enrich the
/// system prompt).
pub fn apply_user_message(app: &AppHandle<Wry>, text: &str) -> State {
    let mut state = load(app);
    let now = now_secs();
    let signals = scoring::classify(text, &state, now);
    let mut total_delta: i32 = 0;
    for (delta, kind, note) in &signals {
        state.score = (state.score + *delta as i64).max(0);
        state.push_event(now, kind, *delta, note);
        total_delta += delta;
        if *kind == "compliment" {
            state.last_compliment_at = now;
        }
    }
    state.total_interactions += 1;
    // Daily streak: increment if last interaction was within 18-36h, else reset.
    let gap = now - state.last_interaction_at;
    if state.last_interaction_at > 0 && (64_800..=129_600).contains(&gap) {
        state.daily_streak += 1;
    } else if gap > 172_800 {
        state.daily_streak = 0;
    }
    state.last_interaction_at = now;

    let prev_stage = state.refresh_stage();
    save(app, &state);
    let _ = app.emit("relationship:updated", state.clone());
    if let Some(prev) = prev_stage {
        tracing::info!(?prev, ?state.stage, "relationship stage changed");
        let _ = app.emit(
            "relationship:stage-change",
            serde_json::json!({
                "previous": prev,
                "current": state.stage,
                "score": state.score,
            }),
        );
    }
    let _ = total_delta;
    state
}

/// Daily decay tick. Applied at most once per 24h; subtracts ~1 point per
/// inactive day past a 24h grace period. Bounded at score >= 0 and cannot
/// drop the user below the Stranger threshold.
pub fn apply_decay(app: &AppHandle<Wry>) {
    if !settings::get_relationship_decay_enabled(app) {
        return;
    }
    let mut state = load(app);
    let now = now_secs();
    if now - state.last_decay_at < 86_400 {
        return;
    }
    state.last_decay_at = now;
    if state.last_interaction_at == 0 {
        save(app, &state);
        return;
    }
    let inactive_days = ((now - state.last_interaction_at) / 86_400).max(0);
    if inactive_days <= 1 {
        save(app, &state);
        return;
    }
    let delta = -(inactive_days.min(3)) as i32;
    state.score = (state.score + delta as i64).max(0);
    state.push_event(now, "decay", delta, "inactivity");
    let prev_stage = state.refresh_stage();
    save(app, &state);
    let _ = app.emit("relationship:updated", state.clone());
    if let Some(prev) = prev_stage {
        let _ = app.emit(
            "relationship:stage-change",
            serde_json::json!({
                "previous": prev,
                "current": state.stage,
                "score": state.score,
            }),
        );
    }
}
