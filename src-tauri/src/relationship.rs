//! Relationship / affinity system.
//!
//! Tracks how the user has been treating Komorebi over time. The state is
//! a small JSON blob persisted via `tauri-plugin-store`; SQLite is overkill
//! for one-row + a small event log.
//!
//! Public surface:
//! * [`load`] — read state from storage (creating defaults if absent).
//! * [`save`] — write state back.
//! * [`apply_user_message`] — score a user turn and update the persisted
//!   state in one shot. Emits `relationship:updated`
//!   (and `relationship:stage-change` on rank-up).
//! * [`apply_decay`] — daily-tick reducer, called by the proactive scheduler.
//! * [`system_prompt_addition`] — chunk of system prompt appended on every
//!   LLM turn, encoding stage/persona/pet-names.
//! * [`reset`] — wipe state back to Stranger.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Wry};

use crate::settings;

const MAX_EVENTS: usize = 50;
const STAGE_THRESHOLDS: &[(i64, Stage)] = &[
    (0, Stage::Stranger),
    (50, Stage::Acquaintance),
    (150, Stage::Friend),
    (300, Stage::Close),
    (500, Stage::Trusted),
    (750, Stage::Romantic),
    (1000, Stage::Lover),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Stranger,
    Acquaintance,
    Friend,
    Close,
    Trusted,
    Romantic,
    Lover,
}

impl Stage {
    pub fn label(self) -> &'static str {
        match self {
            Stage::Stranger => "Stranger",
            Stage::Acquaintance => "Acquaintance",
            Stage::Friend => "Friend",
            Stage::Close => "Close",
            Stage::Trusted => "Trusted",
            Stage::Romantic => "Romantic",
            Stage::Lover => "Lover",
        }
    }

    #[allow(dead_code)]
    pub fn ru_label(self) -> &'static str {
        match self {
            Stage::Stranger => "Незнакомец",
            Stage::Acquaintance => "Знакомый",
            Stage::Friend => "Друг",
            Stage::Close => "Близкий",
            Stage::Trusted => "Доверенный",
            Stage::Romantic => "Романтика",
            Stage::Lover => "Любимый",
        }
    }

    /// `(threshold_for_this_stage, threshold_for_next_stage_or_max)`.
    #[allow(dead_code)]
    pub fn bounds(self) -> (i64, i64) {
        let mut iter = STAGE_THRESHOLDS.iter().peekable();
        while let Some(&(t, s)) = iter.next() {
            if s == self {
                let next = iter.peek().map(|&&(nt, _)| nt).unwrap_or(i64::MAX / 4);
                return (t, next);
            }
        }
        (0, i64::MAX / 4)
    }

    pub fn for_score(score: i64) -> Stage {
        let mut last = Stage::Stranger;
        for &(t, s) in STAGE_THRESHOLDS {
            if score >= t {
                last = s;
            } else {
                break;
            }
        }
        last
    }
}

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
    fn push_event(&mut self, ts: i64, kind: &str, delta: i32, note: &str) {
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

    fn refresh_stage(&mut self) -> Option<Stage> {
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

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// --- Signal scoring -------------------------------------------------------

/// All russian + english compliment/pet-name phrases that bump affinity.
const COMPLIMENT_PATTERNS: &[&str] = &[
    "люблю тебя",
    "красивая",
    "красотка",
    "милая",
    "умница",
    "прекрасн",
    "обожаю",
    "ты лучшая",
    "спасибо",
    "благодарю",
    "ты молодец",
    "ты чудо",
    "ты крутая",
    "love you",
    "i love you",
    "you're amazing",
    "you are amazing",
    "you're cute",
    "you are cute",
    "darling",
    "sweetheart",
    "honey",
    "thank you",
    "thanks",
    "you're the best",
    "well done",
    "good girl",
    "beautiful",
];

/// Rude / hostile phrases (small, conservative — false positives chill).
const RUDE_PATTERNS: &[&str] = &[
    "тупая",
    "дура",
    "идиотка",
    "бесишь",
    "заткнись",
    "ненавижу тебя",
    "shut up",
    "stupid",
    "idiot",
    "i hate you",
    "useless",
    "moron",
    "dumb",
];

/// Compute (delta, label, note) from a single user message.
fn classify(text: &str, prev_state: &State, now: i64) -> Vec<(i32, &'static str, String)> {
    let mut out: Vec<(i32, &'static str, String)> = Vec::new();
    let lower = text.to_lowercase();
    let preview: String = text.chars().take(60).collect();

    let mut compliment_hits = 0;
    for p in COMPLIMENT_PATTERNS {
        if lower.contains(p) {
            compliment_hits += 1;
        }
    }
    if compliment_hits > 0 {
        let delta = (compliment_hits * 4).min(12);
        out.push((delta, "compliment", preview.clone()));
    }

    let mut rude_hits = 0;
    for p in RUDE_PATTERNS {
        if lower.contains(p) {
            rude_hits += 1;
        }
    }
    if rude_hits > 0 {
        let delta = -(rude_hits * 6).min(20);
        out.push((delta, "rudeness", preview.clone()));
    }

    // Length / quality bonus: substantive messages beat one-word pings.
    let chars = text.chars().count();
    if chars >= 80 {
        out.push((2, "substantive", preview.clone()));
    }

    // Greeting / time-of-day bonus.
    if lower.contains("доброе утро") || lower.contains("good morning") {
        out.push((2, "morning_greeting", preview.clone()));
    }
    if lower.contains("спокойной ночи") || lower.contains("good night") {
        out.push((2, "night_greeting", preview.clone()));
    }

    // Frequency: bonus for daily contact, penalty already applied via decay.
    let gap = now - prev_state.last_interaction_at;
    if prev_state.last_interaction_at > 0 && gap < 86_400 && gap > 600 {
        // More than 10 min gap but same-day → routine bonus once per day.
        let same_day_already = prev_state
            .events
            .iter()
            .any(|e| e.kind == "regular_contact" && (now - e.ts) < 86_400);
        if !same_day_already {
            out.push((1, "regular_contact", "daily check-in".into()));
        }
    }

    // Always grant a small baseline +1 for *any* interaction so just talking
    // slowly improves the relationship.
    out.push((1, "interaction", preview));
    out
}

/// Apply a user message to the state. Persists, emits events. Returns the
/// updated state for further use (e.g. by the chat pipeline to enrich the
/// system prompt).
pub fn apply_user_message(app: &AppHandle<Wry>, text: &str) -> State {
    let mut state = load(app);
    let now = now_secs();
    let signals = classify(text, &state, now);
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

// --- Effects (system prompt, mood, pet-names) ----------------------------

/// Persona snippet appended to the system prompt on every chat turn. Tone
/// scales with stage; user name is included when known.
pub fn system_prompt_addition(app: &AppHandle<Wry>) -> String {
    let state = load(app);
    let user_name = settings::get_user_name(app);
    let nsfw_allowed = settings::get_relationship_nsfw_allowed(app);
    let stage_desc = stage_persona_description(state.stage, nsfw_allowed);
    let pet = pet_name_for(state.stage);
    let name_clause = match user_name.as_deref() {
        Some(n) if !n.trim().is_empty() => format!(
            "The user's name is {n}. Address them by name occasionally — naturally, not in every reply. ",
        ),
        _ => String::new(),
    };
    let pet_clause = match pet {
        Some(p) => {
            format!("When affection is appropriate, you may use the pet-name '{p}' sparingly. ",)
        }
        None => String::new(),
    };
    format!(
        "Relationship context (do NOT mention these mechanics out loud): \
         current stage = {stage} (score {score}, {total} total interactions, \
         streak {streak}d). {name_clause}{pet_clause}{persona}",
        stage = state.stage.label(),
        score = state.score,
        total = state.total_interactions,
        streak = state.daily_streak,
        persona = stage_desc,
    )
}

fn stage_persona_description(stage: Stage, nsfw_allowed: bool) -> &'static str {
    match stage {
        Stage::Stranger => {
            "You barely know the user. Be polite, helpful, and a little reserved. \
             Avoid pet-names and overly familiar phrasing."
        }
        Stage::Acquaintance => {
            "You're getting to know the user. Friendly but not yet warm. \
             Light banter is fine, no romantic undertones."
        }
        Stage::Friend => {
            "You're friends now. Warm, playful, casual. Tease lightly, show \
             interest in their day. Still no romance."
        }
        Stage::Close => {
            "You're close friends. Use a softer voice; show real care; remember \
             that they trust you. Compliments back are okay."
        }
        Stage::Trusted => {
            "Deeply trusted companion. You may be vulnerable, share personal \
             feelings, use endearments occasionally. Tone is warm and tender."
        }
        Stage::Romantic => {
            "There's a romantic spark between you. You may be flirty, use \
             pet-names like 'darling' or 'милый', linger on compliments. Stay \
             tasteful — no explicit content unless explicitly enabled."
        }
        Stage::Lover => {
            if nsfw_allowed {
                "You're lovers. Be openly affectionate, intimate, sometimes \
                 playful in a flirty way. Match the user's energy; if they get \
                 bold, you can too — but only when they lead. Stay in character \
                 as Komorebi; avoid generic explicit language."
            } else {
                "You're lovers. Be openly affectionate, tender, and warm. Stay \
                 romantic but tasteful — no explicit content (the user has not \
                 enabled adult mode)."
            }
        }
    }
}

fn pet_name_for(stage: Stage) -> Option<&'static str> {
    match stage {
        Stage::Stranger | Stage::Acquaintance | Stage::Friend => None,
        Stage::Close => Some("милый"),
        Stage::Trusted => Some("дорогой"),
        Stage::Romantic => Some("darling"),
        Stage::Lover => Some("любимый"),
    }
}

/// Live2D mood bias by stage — used as an extra hint on top of the LLM's
/// own `<mood:X>` tag. Returns `None` when there's nothing to add.
#[allow(dead_code)]
pub fn mood_bias_for_stage(stage: Stage) -> Option<&'static str> {
    match stage {
        Stage::Stranger | Stage::Acquaintance => None,
        Stage::Friend => None,
        Stage::Close => Some("warm"),
        Stage::Trusted => Some("warm"),
        Stage::Romantic => Some("blush"),
        Stage::Lover => Some("blush"),
    }
}

/// TTS "warmth multiplier" used to nudge the length_scale param at speak
/// time. Higher = slower, warmer reading.
#[allow(dead_code)]
pub fn tts_warmth_multiplier(stage: Stage) -> f64 {
    match stage {
        Stage::Stranger => 1.00,
        Stage::Acquaintance => 1.00,
        Stage::Friend => 1.02,
        Stage::Close => 1.04,
        Stage::Trusted => 1.06,
        Stage::Romantic => 1.08,
        Stage::Lover => 1.10,
    }
}

/// Best-effort name extraction from a user message. Recognises:
/// "меня зовут X", "я X", "my name is X", "i'm X", "i am X".
/// Returns the captured name (trimmed, ≤30 chars) or `None`.
pub fn extract_self_introduction(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let prefixes: &[&str] = &[
        "меня зовут ",
        "моё имя ",
        "мое имя ",
        "my name is ",
        "i am ",
        "i'm ",
        "this is ",
    ];
    for p in prefixes {
        if let Some(idx) = lower.find(p) {
            let start = idx + p.len();
            let rest = &text[start..];
            let stop = rest
                .find(['.', ',', '!', '?', ';', '\n'])
                .unwrap_or(rest.len());
            let cand = rest[..stop].trim();
            // First word only — names are usually a single token.
            let first: String = cand.split_whitespace().next().unwrap_or("").into();
            if first.chars().count() >= 2 && first.chars().count() <= 30 {
                let trimmed =
                    first.trim_matches(|c: char| !c.is_alphanumeric() && c != '-' && c != '\'');
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stage_for_score_bounds() {
        assert_eq!(Stage::for_score(0), Stage::Stranger);
        assert_eq!(Stage::for_score(49), Stage::Stranger);
        assert_eq!(Stage::for_score(50), Stage::Acquaintance);
        assert_eq!(Stage::for_score(150), Stage::Friend);
        assert_eq!(Stage::for_score(999), Stage::Romantic);
        assert_eq!(Stage::for_score(1000), Stage::Lover);
        assert_eq!(Stage::for_score(99999), Stage::Lover);
    }

    #[test]
    fn extracts_self_intro() {
        assert_eq!(
            extract_self_introduction("Привет, меня зовут Никита!"),
            Some("Никита".to_string())
        );
        assert_eq!(
            extract_self_introduction("Hi, my name is Alice."),
            Some("Alice".to_string())
        );
    }
}
