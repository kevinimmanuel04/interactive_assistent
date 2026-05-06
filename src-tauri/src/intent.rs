//! Local intent classifier integration.
//!
//! Holds a Tauri-managed lazy-loaded [`komorebi_intent::IntentEngine`].
//! The engine downloads a quantized multilingual MiniLM ONNX model
//! (~120 MB) on first use and caches it in the app data directory.
//!
//! Loading is **opt-in** to avoid surprising the user with a network
//! download. The frontend triggers it via the `intent_load` command;
//! status is exposed via `intent_status`.
//!
//! Runtime callers (currently the weather pre-check in
//! `chat::runner`) use [`detect_intent`] which:
//!
//! 1. Returns `None` immediately when the engine isn't loaded — the
//!    caller falls back to the existing keyword logic.
//! 2. Otherwise embeds the query and returns the top match if its
//!    cosine score clears [`komorebi_intent::DEFAULT_ACCEPT_THRESHOLD`].

use komorebi_intent::{Intent, IntentEngine, IntentMatch};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::RwLock;

pub struct IntentState {
    engine: RwLock<Option<Arc<IntentEngine>>>,
}

impl Default for IntentState {
    fn default() -> Self {
        Self {
            engine: RwLock::new(None),
        }
    }
}

impl IntentState {
    pub async fn is_loaded(&self) -> bool {
        self.engine.read().await.is_some()
    }

    pub async fn engine(&self) -> Option<Arc<IntentEngine>> {
        self.engine.read().await.clone()
    }

    /// Build the engine if it isn't already loaded. The first call
    /// blocks for ~5–10 s while fastembed downloads the model from
    /// Hugging Face into `cache_dir`.
    pub async fn load(&self, cache_dir: PathBuf) -> Result<(), String> {
        {
            if self.engine.read().await.is_some() {
                return Ok(());
            }
        }
        let engine = tokio::task::spawn_blocking(move || IntentEngine::new(cache_dir))
            .await
            .map_err(|e| format!("intent load join error: {e}"))?
            .map_err(|e| format!("intent load failed: {e:#}"))?;
        let mut w = self.engine.write().await;
        *w = Some(Arc::new(engine));
        Ok(())
    }
}

/// Synchronous best-effort intent detection. Returns `None` when the
/// engine isn't loaded yet, the query is empty, or no intent clears
/// the default acceptance threshold.
pub async fn detect_intent(app: &tauri::AppHandle<tauri::Wry>, query: &str) -> Option<IntentMatch> {
    detect_intent_above(app, query, komorebi_intent::DEFAULT_ACCEPT_THRESHOLD).await
}

/// Same as [`detect_intent`] but with an explicit threshold. Used by
/// the skill picker, which requires a stronger match before short-
/// circuiting LLM-based classifiers (false positives that trigger
/// volume/screenshot/clipboard skills are far more disruptive than a
/// missed weather pre-check).
pub async fn detect_intent_above(
    app: &tauri::AppHandle<tauri::Wry>,
    query: &str,
    threshold: f32,
) -> Option<IntentMatch> {
    let state = app.try_state::<Arc<IntentState>>()?.inner().clone();
    let engine = state.engine().await?;
    let q = query.to_string();
    tokio::task::spawn_blocking(move || engine.best_above(&q, threshold).ok().flatten())
        .await
        .ok()
        .flatten()
}

/// Resolve the matching skill name (volume/screenshot/clipboard/open/
/// media) when the embedding classifier reports an action-taking intent
/// above [`komorebi_intent::SKILL_ACCEPT_THRESHOLD`]. Returns `None`
/// when the model isn't loaded, the score is too low, or the matched
/// intent isn't a skill (Chat / Weather / ImageGen).
pub async fn detect_skill(app: &tauri::AppHandle<tauri::Wry>, query: &str) -> Option<&'static str> {
    let m = detect_intent_above(app, query, komorebi_intent::SKILL_ACCEPT_THRESHOLD).await?;
    let name = m.intent.skill_name()?;
    tracing::info!(skill = name, score = m.score, "intent: skill chosen");
    Some(name)
}

/// Convenience: did the classifier flag this exact intent?
#[allow(dead_code)]
pub async fn matches(app: &tauri::AppHandle<tauri::Wry>, query: &str, target: Intent) -> bool {
    matches!(detect_intent(app, query).await, Some(m) if m.intent == target)
}
