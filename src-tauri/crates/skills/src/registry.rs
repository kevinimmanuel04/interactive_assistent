//! Registry of built-in skills. Dispatches a query to the first matching one.

use std::sync::Arc;

use crate::{
    clipboard::ClipboardSkill, media::MediaSkill, open::OpenSkill, screenshot::ScreenshotSkill,
    volume::VolumeSkill, Skill, SkillContext, SkillError, SkillResponse,
};

pub struct SkillRegistry {
    skills: Vec<Arc<dyn Skill>>,
}

impl SkillRegistry {
    /// Construct a registry with all built-in skills registered.
    pub fn with_defaults() -> Self {
        let skills: Vec<Arc<dyn Skill>> = vec![
            Arc::new(VolumeSkill),
            Arc::new(ScreenshotSkill),
            Arc::new(ClipboardSkill),
            Arc::new(OpenSkill),
            Arc::new(MediaSkill),
        ];
        Self { skills }
    }

    /// Returns the name of the first skill whose `matches()` returns true.
    pub fn classify(&self, query: &str) -> Option<&'static str> {
        self.skills
            .iter()
            .find(|s| s.matches(query))
            .map(|s| s.name())
    }

    /// Find the first skill that claims this query and run it. Returns
    /// `Err(NotApplicable)` if no skill matched.
    pub async fn dispatch(&self, query: &str) -> Result<SkillResponse, SkillError> {
        let Some(skill) = self.skills.iter().find(|s| s.matches(query)) else {
            return Err(SkillError::NotApplicable);
        };
        let name = skill.name();
        tracing::info!(skill = name, "dispatching skill");
        skill
            .execute(SkillContext {
                query: query.to_string(),
            })
            .await
    }

    /// Run a skill explicitly by name (no `matches()` check). Used by the
    /// LLM intent classifier path. Returns `NotApplicable` if no skill with
    /// that name is registered.
    pub async fn dispatch_named(
        &self,
        name: &str,
        query: &str,
    ) -> Result<SkillResponse, SkillError> {
        let Some(skill) = self.skills.iter().find(|s| s.name() == name) else {
            return Err(SkillError::NotApplicable);
        };
        tracing::info!(
            skill = name,
            mode = "llm-intent",
            "dispatching skill by name"
        );
        skill
            .execute(SkillContext {
                query: query.to_string(),
            })
            .await
    }

    /// Static catalog of `(name, description)` pairs used by the LLM
    /// classifier prompt. Keep descriptions concise — the prompt budget
    /// is tight.
    pub fn catalog() -> Vec<(&'static str, &'static str)> {
        vec![
            (
                "volume",
                "change Windows system audio volume (set to N percent, mute, unmute, louder, quieter)",
            ),
            (
                "screenshot",
                "capture the current screen and save a PNG to the user's Pictures folder",
            ),
            (
                "clipboard",
                "read or write the system clipboard (e.g. 'what's in my clipboard', 'copy hello to clipboard')",
            ),
            (
                "open",
                "launch a Windows application or open a URL in the default browser",
            ),
            (
                "media",
                "control system media playback via Windows SMTC: play, pause, next track, previous track, stop",
            ),
        ]
    }
}

impl Default for SkillRegistry {
    fn default() -> Self {
        Self::with_defaults()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_routes_known_queries() {
        let reg = SkillRegistry::with_defaults();
        assert_eq!(reg.classify("сделай громкость 50%"), Some("volume"));
        assert_eq!(reg.classify("сделай скриншот"), Some("screenshot"));
        assert_eq!(reg.classify("что в буфере обмена"), Some("clipboard"));
        assert_eq!(reg.classify("open https://github.com"), Some("open"));
        assert_eq!(reg.classify("привет, как дела?"), None);
    }
}
