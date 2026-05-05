//! Skill-classifier resolution: cloud → local LLM → keyword fallback.

use super::engines::build_local_engine_at;
use super::ChatService;
use crate::settings;
use komorebi_cloud::{CloudSkillClassifier, SkillIntent};
use komorebi_skills::SkillRegistry;
use tauri::{AppHandle, Wry};

/// Resolve a [`SkillIntent`] for `prompt` using the best classifier
/// available in the current configuration.
///
/// Resolution order:
/// 0. Local embedding classifier ([`crate::intent`]) — when the user
///    has installed the local intent model. ~10 ms cosine match
///    against per-skill anchor phrases. Requires a strong score
///    ([`komorebi_intent::SKILL_ACCEPT_THRESHOLD`] = 0.62) to short-
///    circuit, since false positives trigger real desktop actions.
/// 1. Cloud classifier — if an OpenRouter key is set. Cheapest and most
///    accurate path when the embedding model isn't loaded.
/// 2. Local classifier — if no cloud key but the local LLM is loadable.
///    Lets users on `Mode::Local` (or `Auto` without a key) keep smart
///    routing instead of falling straight to brittle keyword regexes.
///    Tracked by [proposal 0001](../../docs/proposals/0001-smart-routing-local-fallback.md).
/// 3. Keyword router — final fallback. Catches simple phrasings either
///    LLM may misclassify as conversation ("сделай звук 50%").
///
/// Returns `None` when none of the layers found a skill.
pub(super) async fn pick_skill_intent(
    app: &AppHandle<Wry>,
    service: &ChatService,
    prompt: &str,
) -> Option<SkillIntent> {
    let catalog = SkillRegistry::catalog();

    // 0. Local embedding classifier — fast path. Returns `None` when
    // the model isn't loaded so we always fall through gracefully.
    if let Some(name) = crate::intent::detect_skill(app, prompt).await {
        return Some(SkillIntent {
            skill: name.to_string(),
            command: prompt.to_string(),
        });
    }

    // 1. Cloud — preferred when keyed.
    if let Some(key) = settings::get_openrouter_key(app) {
        let model = settings::get_classifier_model(app);
        if let Ok(picker) = CloudSkillClassifier::new(key, model, &catalog) {
            match picker.pick(prompt).await {
                Ok(opt @ Some(_)) => {
                    tracing::info!(
                        picked = ?opt.as_ref().map(|i| i.skill.as_str()),
                        "skill picker: cloud chose"
                    );
                    return opt;
                }
                Ok(None) => {
                    tracing::debug!("skill picker: cloud returned none");
                }
                Err(e) => {
                    tracing::debug!(?e, "skill picker: cloud errored");
                }
            }
        }
    } else {
        // 2. Local — only attempt when no cloud key. Avoids the ~150 ms
        // local-LLM round-trip when the cloud picker is already
        // available and faster.
        //
        // Prefer the dedicated classifier model when configured: a 3B
        // GGUF tuned for routing answers in 50-100 ms whereas a 7B+
        // chat model takes 300-500 ms even on GPU. Fall back to the
        // chat model when no dedicated one is set.
        let classifier_path = settings::get_local_classifier_model_path(app)
            .or_else(|| settings::get_local_model_path(app));
        let engine = build_local_engine_at(app, classifier_path);
        let picker = crate::local_classifier::LocalSkillClassifier::new(engine, &catalog);
        match picker.pick(prompt).await {
            Ok(opt @ Some(_)) => {
                tracing::info!(
                    picked = ?opt.as_ref().map(|i| i.skill.as_str()),
                    "skill picker: local chose"
                );
                return opt;
            }
            Ok(None) => {
                tracing::debug!("skill picker: local returned none");
            }
            Err(komorebi_llm::LlmError::NotAvailable) => {
                tracing::debug!("skill picker: local engine unavailable, using keywords");
            }
            Err(e) => {
                tracing::debug!(?e, "skill picker: local errored");
            }
        }
    }

    // 3. Keyword router — same fallback the legacy code used.
    service.skills.classify(prompt).map(|name| {
        tracing::info!(skill = name, "skill picker: keyword chose");
        SkillIntent {
            skill: name.to_string(),
            command: prompt.to_string(),
        }
    })
}
