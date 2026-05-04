//! Persisted relationship state — score, stage, event log — plus its
//! load/save/reset helpers backed by `tauri-plugin-store`.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Wry};

use super::stage::Stage;
use crate::settings;

const MAX_EVENTS: usize = 50;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub ts: i64,
    pub kind: String,
    pub delta: i32,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct State {
    pub score: i64,
    pub stage: Stage,
    pub last_interaction_at: i64,
    pub last_decay_at: i64,
    pub total_interactions: i64,
    pub daily_streak: i64,
    pub last_compliment_at: i64,
    pub events: Vec<Event>,
}

impl Default for State {
    fn default() -> Self {
        Self {
            score: 0,
            stage: Stage::Stranger,
            last_interaction_at: 0,
            last_decay_at: 0,
            total_interactions: 0,
            daily_streak: 0,
            last_compliment_at: 0,
            events: Vec::new(),
        }
    }
}

impl State {
    pub(super) fn push_event(&mut self, ts: i64, kind: &str, delta: i32, note: &str) {
        self.events.push(Event {
            ts,
            kind: kind.into(),
            delta,
            note: note.chars().take(80).collect(),
        });
        if self.events.len() > MAX_EVENTS {
            let excess = self.events.len() - MAX_EVENTS;
            self.events.drain(0..excess);
        }
    }

    /// If the new score crosses a stage boundary, update the stage and
    /// return the previous one (so callers can emit a stage-change event).
    pub(super) fn refresh_stage(&mut self) -> Option<Stage> {
        let new_stage = Stage::for_score(self.score);
        if new_stage != self.stage {
            let prev = self.stage;
            self.stage = new_stage;
            return Some(prev);
        }
        None
    }
}

pub fn load(app: &AppHandle<Wry>) -> State {
    settings::read_relationship_state(app)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

pub fn save(app: &AppHandle<Wry>, state: &State) {
    if let Ok(v) = serde_json::to_value(state) {
        if let Err(e) = settings::write_relationship_state(app, &v) {
            tracing::warn!(?e, "failed to persist relationship state");
        }
    }
}

pub fn reset(app: &AppHandle<Wry>) {
    if let Err(e) = settings::clear_relationship_state(app) {
        tracing::warn!(?e, "failed to clear relationship state");
    }
    let _ = app.emit("relationship:updated", State::default());
}

pub(super) fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
