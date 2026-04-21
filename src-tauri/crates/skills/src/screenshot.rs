//! Screenshot skill — capture the primary display to a PNG file.
//!
//! The file is written into the user's pictures directory (or the system
//! temp dir as fallback) under `Komorebi/screenshot-<ts>.png`. The reply
//! contains the absolute path so the user (and, later, the assistant) can
//! reference it.

use async_trait::async_trait;
use std::path::PathBuf;

use crate::{norm, Skill, SkillContext, SkillError, SkillResponse};

pub struct ScreenshotSkill;

fn triggers(query: &str) -> bool {
    let q = norm(query);
    q.contains("скриншот") || q.contains("screenshot") || q.contains("снимок экрана")
}

fn output_dir() -> PathBuf {
    let base = dirs::picture_dir().unwrap_or_else(std::env::temp_dir);
    base.join("Komorebi")
}

#[async_trait]
impl Skill for ScreenshotSkill {
    fn name(&self) -> &'static str {
        "screenshot"
    }

    fn matches(&self, query: &str) -> bool {
        triggers(query)
    }

    async fn execute(&self, _ctx: SkillContext) -> Result<SkillResponse, SkillError> {
        tokio::task::spawn_blocking(|| -> Result<SkillResponse, SkillError> {
            let monitors = xcap::Monitor::all()
                .map_err(|e| SkillError::Exec(format!("monitor enumerate: {e}")))?;
            let primary = monitors
                .into_iter()
                .next()
                .ok_or_else(|| SkillError::Exec("no monitors available".into()))?;
            let image = primary
                .capture_image()
                .map_err(|e| SkillError::Exec(format!("capture: {e}")))?;

            let dir = output_dir();
            std::fs::create_dir_all(&dir)
                .map_err(|e| SkillError::Exec(format!("create_dir_all: {e}")))?;
            let ts = chrono::Local::now().format("%Y%m%d-%H%M%S");
            let path = dir.join(format!("screenshot-{ts}.png"));
            image
                .save(&path)
                .map_err(|e| SkillError::Exec(format!("save png: {e}")))?;
            Ok(SkillResponse {
                text: format!("Saved screenshot to {}", path.display()),
            })
        })
        .await
        .map_err(|e| SkillError::Exec(format!("join error: {e}")))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_screenshot_queries() {
        assert!(triggers("сделай скриншот"));
        assert!(triggers("take a screenshot"));
        assert!(triggers("снимок экрана"));
        assert!(!triggers("привет"));
    }
}
