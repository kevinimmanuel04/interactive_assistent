//! Relationship stages and score thresholds.
//!
//! The stage is purely a function of `state.score` — see
//! [`Stage::for_score`]. Rank-up/rank-down happens lazily via
//! `State::refresh_stage` (declared in `super::state`).

use serde::{Deserialize, Serialize};

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
}
