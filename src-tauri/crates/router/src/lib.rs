//! Request router: decides whether a user query goes to the local LLM,
//! the cloud (OpenRouter), or a system skill.
//!
//! Two layers:
//! - [`classify`] — synchronous keyword / rule-based routing. Fast path,
//!   used offline and as the fallback when an LLM classifier fails.
//! - [`classify_async`] — optionally consults an [`IntentClassifier`] to
//!   pick between Local and Cloud based on query complexity. Skills are
//!   still detected by the keyword layer (high precision, zero latency).

pub mod chat;
pub use chat::{ChatEvent, ChatMessage, Role};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Route {
    Local,
    Cloud,
    Skill,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    #[default]
    Auto,
    Local,
    Cloud,
}

/// Async classifier that chooses Local or Cloud based on a query.
/// Implementations may return `None` to defer to the keyword fallback
/// (e.g. on timeout or network error).
#[async_trait]
pub trait IntentClassifier: Send + Sync {
    async fn decide(&self, query: &str) -> Option<Route>;
}

/// Keyword skill detector extracted so it can be reused by [`classify_async`].
///
/// Kept in sync (loosely) with the per-skill matchers in
/// `komorebi_skills` — those are authoritative; this list just decides
/// whether the request *looks* like a skill so we route to the registry
/// at all. Err on the side of recall: a false positive here just means
/// `SkillRegistry::dispatch` returns `NotApplicable` and we fall back to
/// the LLM. A false negative means the LLM gets asked to change system
/// volume / take screenshots — which it can't, and the user gets the
/// dreaded "I'm just a chatbot" reply.
fn detect_skill(q_lower: &str, query: &str) -> bool {
    let skill_markers = [
        // volume — RU/EN/UK
        "громкост",
        "громче",
        "тише",
        "звук",
        "volume",
        "louder",
        "quieter",
        "sound",
        "mute",
        "unmute",
        "выключи звук",
        "вимкни звук",
        "увімкни звук",
        "гучніст",
        "гучн",
        "тихіше",
        // screenshot — RU/EN/UK
        "скриншот",
        "скрин",
        "screenshot",
        "screen shot",
        "screen capture",
        "снимок экрана",
        "снимок рабочего стола",
        "знімок екрана",
        "скріншот",
        "print screen",
        "prtsc",
        // clipboard — RU/EN/UK
        "буфер",
        "clipboard",
        "clip board",
        "paste",
        "вставь из буфера",
        "вставити з буфера",
        "скопируй",
        "скопіюй",
        "copy ",
        // open / launch — RU/EN/UK
        "запусти ",
        "запустить ",
        "запустити ",
        "launch ",
        "открой ",
        "открыть ",
        "відкрий ",
        "відкрити ",
        "open ",
        "start ",
        "run ",
        "включи ",
        "увімкни ",
        // media — RU/EN/UK
        "следующий трек",
        "наступний трек",
        "next track",
        "previous track",
        "предыдущий трек",
        "попередній трек",
        "пауза",
        "pause music",
        "поставь на паузу",
        "пресс плей",
        "play music",
        "включи музык",
        "увімкни музик",
        "стоп музык",
        "stop music",
    ];
    let _ = query;
    skill_markers.iter().any(|m| q_lower.contains(m))
}

fn keyword_local_vs_cloud(q_lower: &str, raw_len: usize) -> Route {
    let cloud_markers = [
        "code",
        "refactor",
        "написать код",
        "translate",
        "переведи",
        "анализ",
        "analyze",
        "essay",
        "философ",
        "explain in detail",
    ];
    if raw_len > 400 || cloud_markers.iter().any(|m| q_lower.contains(m)) {
        Route::Cloud
    } else {
        Route::Local
    }
}

pub fn classify(query: &str, mode: Mode) -> Route {
    // Skills are detected regardless of forced Local/Cloud mode — the
    // user's "Cloud only" preference is about LLM choice, not about
    // disabling deterministic system commands like volume/screenshot.
    let q = query.to_lowercase();
    if detect_skill(&q, query) {
        return Route::Skill;
    }
    match mode {
        Mode::Local => return Route::Local,
        Mode::Cloud => return Route::Cloud,
        Mode::Auto => {}
    }
    keyword_local_vs_cloud(&q, query.len())
}

/// Async variant: skills are still detected by keywords; the Local/Cloud
/// decision is delegated to `classifier` when one is provided. Falls back
/// to the keyword heuristic on `None`.
pub async fn classify_async(
    query: &str,
    mode: Mode,
    classifier: Option<&dyn IntentClassifier>,
) -> Route {
    let q = query.to_lowercase();
    if detect_skill(&q, query) {
        return Route::Skill;
    }
    match mode {
        Mode::Local => return Route::Local,
        Mode::Cloud => return Route::Cloud,
        Mode::Auto => {}
    }
    if let Some(c) = classifier {
        if let Some(route) = c.decide(query).await {
            // Clamp — the classifier should never return Skill here, but
            // if it does, respect it.
            return route;
        }
    }
    keyword_local_vs_cloud(&q, query.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forced_mode_wins() {
        assert_eq!(classify("anything", Mode::Local), Route::Local);
        assert_eq!(classify("anything", Mode::Cloud), Route::Cloud);
    }

    #[test]
    fn code_goes_to_cloud() {
        assert_eq!(
            classify("write code for a quicksort", Mode::Auto),
            Route::Cloud
        );
    }

    #[test]
    fn volume_goes_to_skill() {
        assert_eq!(classify("сделай громкость 50%", Mode::Auto), Route::Skill);
    }

    #[test]
    fn default_is_local() {
        assert_eq!(classify("привет, как дела?", Mode::Auto), Route::Local);
    }

    struct FixedClassifier(Route);

    #[async_trait]
    impl IntentClassifier for FixedClassifier {
        async fn decide(&self, _query: &str) -> Option<Route> {
            Some(self.0)
        }
    }

    struct AlwaysAbstain;

    #[async_trait]
    impl IntentClassifier for AlwaysAbstain {
        async fn decide(&self, _query: &str) -> Option<Route> {
            None
        }
    }

    #[tokio::test]
    async fn async_skill_detection_bypasses_classifier() {
        // Skill keywords always win, even when the classifier would say Cloud.
        let c = FixedClassifier(Route::Cloud);
        assert_eq!(
            classify_async("сделай скриншот", Mode::Auto, Some(&c)).await,
            Route::Skill,
        );
    }

    #[tokio::test]
    async fn async_classifier_overrides_keyword_heuristic() {
        // "привет" would be Local by keywords; classifier promotes to Cloud.
        let c = FixedClassifier(Route::Cloud);
        assert_eq!(
            classify_async("привет", Mode::Auto, Some(&c)).await,
            Route::Cloud,
        );
    }

    #[tokio::test]
    async fn async_abstain_falls_back_to_keywords() {
        let c = AlwaysAbstain;
        assert_eq!(
            classify_async("привет", Mode::Auto, Some(&c)).await,
            Route::Local,
        );
        assert_eq!(
            classify_async("write code for quicksort", Mode::Auto, Some(&c)).await,
            Route::Cloud,
        );
    }

    #[tokio::test]
    async fn async_forced_mode_wins() {
        let c = FixedClassifier(Route::Cloud);
        assert_eq!(
            classify_async("anything", Mode::Local, Some(&c)).await,
            Route::Local,
        );
    }
}
