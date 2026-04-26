//! System skills: volume, screenshot, app launch, clipboard.
//!
//! A `Skill` is a small, self-contained capability the assistant can invoke
//! without going through the LLM (e.g. "open https://github.com", "сделай
//! скриншот"). Each skill decides whether it matches a query via its own
//! heuristic; the [`SkillRegistry`] picks the first match.

use async_trait::async_trait;

pub mod clipboard;
pub mod media;
pub mod open;
pub mod registry;
pub mod screenshot;
pub mod volume;

pub use registry::SkillRegistry;

#[derive(Debug, Clone)]
pub struct SkillContext {
    pub query: String,
}

#[derive(Debug, Clone)]
pub struct SkillResponse {
    pub text: String,
}

#[derive(thiserror::Error, Debug)]
pub enum SkillError {
    #[error("skill not applicable")]
    NotApplicable,
    #[error("execution failed: {0}")]
    Exec(String),
}

#[async_trait]
pub trait Skill: Send + Sync {
    fn name(&self) -> &'static str;
    fn matches(&self, query: &str) -> bool;
    async fn execute(&self, ctx: SkillContext) -> Result<SkillResponse, SkillError>;
}

/// Lowercase + trim helper for matching heuristics.
pub(crate) fn norm(q: &str) -> String {
    q.trim().to_lowercase()
}
