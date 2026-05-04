//! Signal scoring: turns a single user message into a list of scored
//! events that get folded into [`crate::relationship::State`].

use super::state::State;

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

/// Compute a list of `(delta, label, note)` signals from a single user
/// message. `prev_state.last_interaction_at` is used to detect daily
/// check-ins; `now` is current Unix seconds.
pub(super) fn classify(
    text: &str,
    prev_state: &State,
    now: i64,
) -> Vec<(i32, &'static str, String)> {
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
