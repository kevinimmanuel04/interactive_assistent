//! Local-LLM intent classifier.
//!
//! Mirror of [`komorebi_cloud::CloudSkillClassifier`] that routes through
//! the bundled llama.cpp engine instead of OpenRouter. Same prompt, same
//! JSON contract, same parser — only the transport changes.
//!
//! See [`docs/proposals/0001-smart-routing-local-fallback.md`](../../../docs/proposals/0001-smart-routing-local-fallback.md)
//! for the design rationale.

use std::sync::Arc;

use komorebi_cloud::{build_skill_system_prompt, parse_skill_json, SkillIntent};
use komorebi_llm::{CompletionOptions, LlmEngine, LlmError};
use komorebi_router::ChatMessage;

/// Asks the local LLM the same skill-routing question the cloud
/// classifier asks. Falls through to `Ok(None)` (no intent) when the
/// engine isn't available — callers then drop to the keyword router.
pub struct LocalSkillClassifier {
    engine: Arc<dyn LlmEngine>,
    skills_doc: String,
}

impl LocalSkillClassifier {
    /// `skills` is the same `[(name, description)]` list the cloud
    /// classifier consumes. Engine is constructed by the caller (so the
    /// caller controls model path / GPU layers).
    pub fn new(engine: Arc<dyn LlmEngine>, skills: &[(&str, &str)]) -> Self {
        let mut doc = String::from("Available skills:\n");
        for (name, desc) in skills {
            doc.push_str(&format!("- {name}: {desc}\n"));
        }
        Self {
            engine,
            skills_doc: doc,
        }
    }

    /// Classify `query` against the skill catalog. `Ok(None)` means the
    /// model said "none" or its reply was unparseable (caller should fall
    /// back to the keyword router). `Err` is reserved for engine-level
    /// failures the caller may want to log (e.g. stub engine, model load
    /// failure).
    pub async fn pick(&self, query: &str) -> Result<Option<SkillIntent>, LlmError> {
        let messages = [
            ChatMessage::system(build_skill_system_prompt(&self.skills_doc)),
            ChatMessage::user(query.to_string()),
        ];
        let opts = CompletionOptions {
            // 64 tokens matches the cloud classifier; the JSON we expect
            // is well under that. The default trait impl converts this
            // to a ~384-char output cap which is plenty for `{"skill":
            // "...", "command": "..."}`.
            max_tokens: Some(64),
            // Local backends ignore this for now (see the trait docs);
            // wired in for the day llama.rs grows real param plumbing.
            temperature: Some(0.0),
        };
        let raw = self.engine.complete(&messages, opts).await?;
        Ok(parse_skill_json(&raw))
    }
}
