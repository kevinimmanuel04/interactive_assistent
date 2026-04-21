//! System skills: volume, screenshot, app launch, clipboard, media control.
//! Populated in Phase 3.

use async_trait::async_trait;

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
