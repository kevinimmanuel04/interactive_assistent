//! Local intent classifier — replaces scattered keyword/substring
//! matchers with a unified embedding-based router.
//!
//! Pipeline at runtime:
//!
//! 1. **Keyword fast-path** (call site, not here): `/img`, `/weather`,
//!    short obvious cases stay on regex/prefix matching for ~1 ms
//!    latency.
//! 2. **Embedding similarity** (this crate): for everything else, the
//!    query is embedded with quantized multilingual MiniLM
//!    (`paraphrase-multilingual-MiniLM-L12-v2`, 384-dim, ~120 MB
//!    quantized) and scored against per-intent anchor phrases via
//!    cosine similarity (max-pool over anchors).
//! 3. **Threshold**: if the best score ≥ `accept_threshold`, that
//!    intent wins. Otherwise the caller falls through to whatever
//!    the existing logic was (LLM chat, keyword router, etc.) — so
//!    failure is always graceful and the assistant never breaks.
//!
//! The model is downloaded by `fastembed` to a cache dir on first use
//! (~5–10 s on a typical connection) and reused thereafter. If
//! download fails or the model isn't available, [`IntentEngine::new`]
//! returns an error and the caller is expected to fall back.

mod anchors;

pub use anchors::Intent;

use anyhow::{Context, Result};
use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use parking_lot::Mutex;
use std::path::PathBuf;

/// One classifier result.
#[derive(Debug, Clone, Copy, serde::Serialize)]
pub struct IntentMatch {
    pub intent: Intent,
    /// Cosine similarity in [−1, 1]; ~0.55+ is usually a confident
    /// match for paraphrase-MiniLM on this kind of short utterance.
    pub score: f32,
}

/// Default cutoff. Tuned conservatively: false negatives (the user
/// rephrasing weirdly) fall through to the existing keyword logic,
/// false positives (hijacking normal chat) are far worse.
pub const DEFAULT_ACCEPT_THRESHOLD: f32 = 0.55;

/// Higher threshold for action-taking skills (volume / screenshot /
/// clipboard / open / media). False positives here are user-visible
/// — taking a screenshot when the user only said "i was looking at
/// the screen" — so we require a stronger match before short-
/// circuiting LLM-based classifiers.
pub const SKILL_ACCEPT_THRESHOLD: f32 = 0.62;

/// The engine. Holds the loaded model + pre-computed anchor embeddings
/// for every non-`Chat` intent.
pub struct IntentEngine {
    model: Mutex<TextEmbedding>,
    /// Parallel arrays: `intents[i]` corresponds to `anchor_embeds[i]`,
    /// each a `Vec<Vec<f32>>` (one embedding per anchor phrase).
    intents: Vec<Intent>,
    anchor_embeds: Vec<Vec<Vec<f32>>>,
}

impl IntentEngine {
    /// Construct the engine using a custom cache directory (for the
    /// downloaded ONNX model + tokenizer). On first run this triggers
    /// a ~120 MB download from Hugging Face; subsequent runs are
    /// instant.
    pub fn new(cache_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&cache_dir).ok();

        let mut model = TextEmbedding::try_new(
            InitOptions::new(EmbeddingModel::ParaphraseMLMiniLML12V2Q)
                .with_cache_dir(cache_dir)
                .with_show_download_progress(true),
        )
        .context("failed to initialize fastembed text-embedding model")?;

        // Pre-compute anchor embeddings for every skill intent.
        let mut intents = Vec::with_capacity(Intent::SKILL_INTENTS.len());
        let mut anchor_embeds = Vec::with_capacity(Intent::SKILL_INTENTS.len());
        for &intent in Intent::SKILL_INTENTS {
            let phrases = intent.anchors();
            if phrases.is_empty() {
                continue;
            }
            let embeds = model
                .embed(phrases, None)
                .with_context(|| format!("embedding anchors for {:?}", intent))?;
            intents.push(intent);
            anchor_embeds.push(embeds);
        }

        Ok(Self {
            model: Mutex::new(model),
            intents,
            anchor_embeds,
        })
    }

    /// Score `query` against every intent and return the best match
    /// (ranked by cosine similarity). Always returns at least one
    /// entry per intent so callers can apply their own thresholds.
    pub fn classify(&self, query: &str) -> Result<Vec<IntentMatch>> {
        let q = query.trim();
        if q.is_empty() {
            return Ok(Vec::new());
        }
        let qvec = {
            let mut model = self.model.lock();
            model
                .embed(vec![q.to_string()], None)
                .context("query embedding failed")?
                .into_iter()
                .next()
                .context("empty query embedding")?
        };

        let mut out = Vec::with_capacity(self.intents.len());
        for (intent, anchors) in self.intents.iter().zip(self.anchor_embeds.iter()) {
            let mut best = f32::NEG_INFINITY;
            for a in anchors {
                let s = cosine(&qvec, a);
                if s > best {
                    best = s;
                }
            }
            out.push(IntentMatch {
                intent: *intent,
                score: best,
            });
        }
        out.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        Ok(out)
    }

    /// Convenience: best match if it clears `threshold`, else `None`.
    pub fn best_above(&self, query: &str, threshold: f32) -> Result<Option<IntentMatch>> {
        let mut all = self.classify(query)?;
        if let Some(top) = all.drain(..).next() {
            if top.score >= threshold {
                return Ok(Some(top));
            }
        }
        Ok(None)
    }
}

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0_f32;
    let mut na = 0.0_f32;
    let mut nb = 0.0_f32;
    for i in 0..a.len() {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    let d = (na.sqrt() * nb.sqrt()).max(1e-8);
    dot / d
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cosine_identity_is_one() {
        let v = vec![1.0_f32, 0.5, -0.25];
        let c = cosine(&v, &v);
        assert!((c - 1.0).abs() < 1e-6, "cos(v,v) = {c}");
    }

    #[test]
    fn cosine_orthogonal_is_zero() {
        let a = vec![1.0_f32, 0.0];
        let b = vec![0.0_f32, 1.0];
        assert!(cosine(&a, &b).abs() < 1e-6);
    }
}
