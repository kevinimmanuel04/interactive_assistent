//! Request router: decides whether a user query goes to the local LLM,
//! the cloud (OpenRouter), or a system skill.
//!
//! Phase 1: keyword / rule based.
//! Phase 3: LLM- or embedding-based classifier with the rules as fallback.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Route {
    Local,
    Cloud,
    Skill,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum Mode {
    #[default]
    Auto,
    Local,
    Cloud,
}

pub fn classify(query: &str, mode: Mode) -> Route {
    match mode {
        Mode::Local => return Route::Local,
        Mode::Cloud => return Route::Cloud,
        Mode::Auto => {}
    }

    let q = query.to_lowercase();

    // Heuristics: long / code / translation / analysis => cloud.
    let cloud_markers = [
        "code", "refactor", "написать код", "translate", "переведи",
        "анализ", "analyze", "essay", "философ", "explain in detail",
    ];
    if query.len() > 400 || cloud_markers.iter().any(|m| q.contains(m)) {
        return Route::Cloud;
    }

    // Skill markers (expanded in Phase 3).
    let skill_markers = ["громкость", "volume", "скриншот", "screenshot", "запусти", "open "];
    if skill_markers.iter().any(|m| q.contains(m)) {
        return Route::Skill;
    }

    Route::Local
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
        assert_eq!(classify("write code for a quicksort", Mode::Auto), Route::Cloud);
    }

    #[test]
    fn volume_goes_to_skill() {
        assert_eq!(classify("сделай громкость 50%", Mode::Auto), Route::Skill);
    }

    #[test]
    fn default_is_local() {
        assert_eq!(classify("привет, как дела?", Mode::Auto), Route::Local);
    }
}
