//! Proactive agent loop — LLM-driven (v1.1).
//!
//! Architecture:
//!   * Background tokio task polls every 90 s.
//!   * Each tick gathers a context snapshot (active window, idle time,
//!     gaming heuristics) and asks a small fast LLM whether to surface
//!     a proactive nudge and what to say.
//!   * The LLM is forced into JSON mode: `{"act": true|false, "hint": "..."}`.
//!   * If `act=true`, we emit `proactive:suggest` so the frontend can
//!     route it through the normal chat pipeline (TTS + Live2D).
//!
//! Why LLM and not if/else? The user explicitly hated rigid rules. The
//! model can phrase a hint about "you've been on the same Stack Overflow
//! tab for 20 min" differently every time, in the user's language, while
//! the host still respects cooldowns.
//!
//! Fallback: when no OpenRouter key is configured, we degrade to a tiny
//! rule-based mode (one generic hint per condition) so something works
//! offline.

use crate::settings;
use komorebi_cloud::OpenRouterClient;
use komorebi_desktop::{procs, AppKind};
use komorebi_router::ChatMessage;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Wry};

static LAST_INTERACTION: AtomicI64 = AtomicI64::new(0);

pub fn bump_last_interaction() {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    LAST_INTERACTION.store(ts, Ordering::Relaxed);
}

fn seconds_since_last() -> i64 {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let last = LAST_INTERACTION.load(Ordering::Relaxed);
    if last == 0 {
        0
    } else {
        now - last
    }
}

#[derive(serde::Serialize, Clone)]
pub struct ProactivePayload {
    pub context: String,
    pub hint: String,
}

const POLL_SECS: u64 = 90;
const COOLDOWN_SECS: u64 = 480; // 8 min between nudges
const MIN_IDLE_SECS: i64 = 120; // user must be quiet for at least 2 min

pub fn spawn(app: AppHandle<Wry>) {
    bump_last_interaction();
    tauri::async_runtime::spawn(async move {
        let mut last_fired = Instant::now()
            .checked_sub(Duration::from_secs(COOLDOWN_SECS))
            .unwrap_or_else(Instant::now);
        loop {
            tokio::time::sleep(Duration::from_secs(POLL_SECS)).await;
            // Relationship decay tick — runs on the same cadence; the
            // relationship module itself rate-limits to once per 24h.
            crate::relationship::apply_decay(&app);
            if !settings::get_proactive_enabled(&app) {
                continue;
            }
            if last_fired.elapsed() < Duration::from_secs(COOLDOWN_SECS) {
                continue;
            }
            let idle = seconds_since_last();
            if idle < MIN_IDLE_SECS {
                continue;
            }

            let active = procs::active_window();
            let snap = build_snapshot(&active, idle);
            let Some((ctx, hint)) = decide(&app, &snap).await else {
                continue;
            };

            let _ = app.emit(
                "proactive:suggest",
                ProactivePayload {
                    context: ctx,
                    hint: hint.clone(),
                },
            );
            last_fired = Instant::now();
            tracing::info!(hint = %hint, "proactive suggestion emitted");
        }
    });
}

struct Snapshot {
    active_kind: Option<AppKind>,
    process_name: String,
    title: String,
    is_fullscreen: bool,
    idle_secs: i64,
}

fn build_snapshot(active: &Option<procs::ActiveWindow>, idle: i64) -> Snapshot {
    if let Some(w) = active {
        Snapshot {
            active_kind: Some(w.kind),
            process_name: w.process_name.clone(),
            title: w.title.clone(),
            is_fullscreen: w.is_fullscreen,
            idle_secs: idle,
        }
    } else {
        Snapshot {
            active_kind: None,
            process_name: String::new(),
            title: String::new(),
            is_fullscreen: false,
            idle_secs: idle,
        }
    }
}

async fn decide(app: &AppHandle<Wry>, snap: &Snapshot) -> Option<(String, String)> {
    if let Some(key) = settings::get_openrouter_key(app) {
        let model = settings::get_classifier_model(app);
        if let Ok(client) = OpenRouterClient::new(key) {
            if let Some(out) = decide_via_llm(&client, &model, snap).await {
                return Some(out);
            }
        }
    }
    decide_via_rules(snap)
}

async fn decide_via_llm(
    client: &OpenRouterClient,
    model: &str,
    snap: &Snapshot,
) -> Option<(String, String)> {
    let kind = snap
        .active_kind
        .map(|k| format!("{:?}", k))
        .unwrap_or_else(|| "Unknown".into());
    let user = format!(
        "context:\n  active_app_kind: {kind}\n  process: {proc}\n  window_title: {title}\n  fullscreen: {fs}\n  user_idle_seconds: {idle}\n",
        proc = snap.process_name,
        title = snap.title,
        fs = snap.is_fullscreen,
        idle = snap.idle_secs,
    );
    let messages = [
        ChatMessage::system(SYSTEM_PROMPT.to_string()),
        ChatMessage::user(user),
    ];
    let raw = match tokio::time::timeout(
        Duration::from_secs(8),
        client.complete(model, &messages, 80),
    )
    .await
    {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => {
            tracing::debug!(?e, "proactive: LLM call failed");
            return None;
        }
        Err(_) => {
            tracing::debug!("proactive: LLM call timed out");
            return None;
        }
    };
    let trimmed = raw.trim();
    let inner = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .map(|s| s.trim_end_matches("```").trim())
        .unwrap_or(trimmed);
    #[derive(serde::Deserialize)]
    struct Reply {
        #[serde(default)]
        act: bool,
        #[serde(default)]
        hint: String,
    }
    let v: Reply = serde_json::from_str(inner).ok()?;
    if !v.act || v.hint.trim().is_empty() {
        return None;
    }
    let ctx_label = if snap.process_name.is_empty() {
        format!("Idle {}s", snap.idle_secs)
    } else {
        format!("{} ({})", snap.process_name, kind)
    };
    Some((ctx_label, v.hint.trim().to_string()))
}

fn decide_via_rules(snap: &Snapshot) -> Option<(String, String)> {
    let kind = snap.active_kind?;
    let gaming = kind == AppKind::Game || snap.is_fullscreen;
    if gaming {
        return Some((
            format!("Gaming: {}", snap.process_name),
            "I see you've been at it for a while. Want a quick break reminder?".into(),
        ));
    }
    if kind == AppKind::Ide {
        return Some((
            format!("Coding in {}", snap.process_name),
            "Stuck on something? I can help with the code.".into(),
        ));
    }
    if kind == AppKind::Browser {
        return Some((
            format!("Browsing: {}", snap.title),
            "Need a summary of what you're reading?".into(),
        ));
    }
    if snap.idle_secs > 1800 {
        return Some((
            "Long idle".into(),
            "Hey, I'm still here if you need me.".into(),
        ));
    }
    None
}

const SYSTEM_PROMPT: &str = "You are the proactive nudge engine of Komorebi, a desktop \
assistant. You receive a snapshot of the user's environment and decide whether \
to suggest something. Be sparing — the host already throttles you to once every \
few minutes, but you should still skip nudging when nothing useful comes to mind.\n\n\
Output strict JSON: {\"act\": true|false, \"hint\": \"<one short sentence>\"}.\n\
Rules:\n\
- Match the user's likely language (Russian if process or title is Cyrillic, else English).\n\
- The hint must be ONE short sentence, friendly but not nagging.\n\
- For games: vary between break reminders, hydration cues, and quick-tip offers.\n\
- For IDEs: offer code help, stuck-debugging help, or refactor suggestions.\n\
- For browsers: offer to summarize, translate, or quiz the user.\n\
- For long idle (>15 min): say something low-key, never alarming.\n\
- If no good nudge fits, return {\"act\": false, \"hint\": \"\"}.\n\
- NEVER include markdown, code fences, or commentary — JSON only.";
