//! Game Coach mode (v1.7.x).
//!
//! When the active foreground app classifies as `AppKind::Game` (or is
//! fullscreen in general) AND the user has opted into coach mode, we
//! periodically emit a short tactical hint via the `coach:tip` event.
//! The frontend renders these as a separate bubble channel so they
//! never interrupt an in-progress chat reply.
//!
//! Two transports are supported:
//!
//! * **Vision** (default, `game_coach_use_vision = true`): captures the
//!   primary monitor as PNG, downscales to ~960 px, and asks an
//!   OpenRouter vision model for a hint based on what's on screen.
//!   Costs OpenRouter credits and requires a key.
//! * **Text** (local-friendly): only sees the active window title +
//!   process name. Routes through the local LLM when available, then
//!   falls back to OpenRouter (text completion) if no local model is
//!   set. Tracked by [proposal 0002].
//!
//! Cooldown is intentionally generous (~75 s) so we don't spam the user
//! or rack up vision-API spend.
//!
//! [proposal 0002]: ../../docs/proposals/0002-game-coach-text-vision-split.md

use crate::settings;
use komorebi_cloud::OpenRouterClient;
use komorebi_desktop::procs::ActiveWindow;
use komorebi_desktop::{capture, procs, AppKind};
use komorebi_llm::CompletionOptions;
use komorebi_router::ChatMessage;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Wry};

const POLL_SECS: u64 = 30;
const COOLDOWN_SECS: u64 = 75;
const VISION_TIMEOUT_SECS: u64 = 15;
const TEXT_TIMEOUT_SECS: u64 = 8;
/// Both paths request short hints (~80 tokens). The text path uses the
/// same budget so the local LLM doesn't ramble.
const HINT_MAX_TOKENS: u32 = 80;

const COACH_SYSTEM: &str = "You are a friendly co-op gaming coach. \
You speak the user's language. You never lie about what you cannot see. \
You keep hints short — one sentence.";

#[derive(serde::Serialize, Clone)]
pub struct CoachPayload {
    pub game: String,
    pub hint: String,
    /// One of `"vision-cloud"`, `"text-cloud"`, `"text-local"`. Logged
    /// in telemetry so we can see which path users actually take.
    pub route: &'static str,
}

pub fn spawn(app: AppHandle<Wry>) {
    tauri::async_runtime::spawn(async move {
        let mut last_fired = Instant::now()
            .checked_sub(Duration::from_secs(COOLDOWN_SECS))
            .unwrap_or_else(Instant::now);
        loop {
            tokio::time::sleep(Duration::from_secs(POLL_SECS)).await;
            if !settings::get_game_coach_enabled(&app) {
                continue;
            }
            if last_fired.elapsed() < Duration::from_secs(COOLDOWN_SECS) {
                continue;
            }
            let Some(active) = procs::active_window() else {
                continue;
            };
            let in_game = active.kind == AppKind::Game || active.is_fullscreen;
            if !in_game {
                continue;
            }

            let use_vision = settings::get_game_coach_use_vision(&app);
            let key = settings::get_openrouter_key(&app);

            let outcome = if use_vision {
                if let Some(k) = key.clone() {
                    run_vision(&app, &active, k).await
                } else {
                    run_text(&app, &active, key).await
                }
            } else {
                run_text(&app, &active, key).await
            };

            let Some((hint, route)) = outcome else {
                continue;
            };
            if hint.is_empty()
                || hint.eq_ignore_ascii_case("skip")
                || hint.eq_ignore_ascii_case("skip.")
            {
                continue;
            }

            let _ = app.emit(
                "coach:tip",
                CoachPayload {
                    game: active.process_name.clone(),
                    hint: hint.clone(),
                    route,
                },
            );
            last_fired = Instant::now();
            tracing::info!(
                game = %active.process_name,
                route = route,
                hint = %hint,
                "coach tip emitted"
            );
        }
    });
}

/// Vision path: capture screen → downscale → call OpenRouter vision
/// model. Returns `None` on any error so the loop just waits for the
/// next poll.
async fn run_vision(
    app: &AppHandle<Wry>,
    active: &ActiveWindow,
    key: String,
) -> Option<(String, &'static str)> {
    let model = settings::get_game_coach_model(app);

    // Capture screen on a blocking thread to avoid stalling the tokio
    // worker (xcap is sync).
    let png = match tokio::task::spawn_blocking(|| capture::capture_screen(0)).await {
        Ok(Ok(b)) => b,
        Ok(Err(e)) => {
            tracing::debug!(?e, "coach: capture failed");
            return None;
        }
        Err(e) => {
            tracing::debug!(?e, "coach: capture join failed");
            return None;
        }
    };
    let small = downscale_png(&png, 960).unwrap_or(png);

    let client = match OpenRouterClient::new(key) {
        Ok(c) => c,
        Err(e) => {
            tracing::debug!(?e, "coach: client init failed");
            return None;
        }
    };

    let user_text = format!(
        "Game: {} (window title: {}). Look at the screenshot and \
         give ONE concise, actionable tactical hint based on what \
         you see right now (low health, an enemy approaching, an \
         unread quest marker, a UI affordance the player is \
         missing, etc.). Keep it under 20 words. If nothing \
         noteworthy, reply with exactly: SKIP.",
        active.process_name, active.title,
    );

    let raw = match tokio::time::timeout(
        Duration::from_secs(VISION_TIMEOUT_SECS),
        client.complete_vision(&model, COACH_SYSTEM, &user_text, &small, HINT_MAX_TOKENS),
    )
    .await
    {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => {
            tracing::debug!(?e, "coach: vision call failed");
            return None;
        }
        Err(_) => {
            tracing::debug!("coach: vision call timed out");
            return None;
        }
    };
    Some((raw.trim().trim_matches('"').to_string(), "vision-cloud"))
}

/// Text-only path. Prefers the local LLM (free, offline) and falls back
/// to a non-vision OpenRouter completion if no local model is set.
/// Returns `None` if neither transport is available.
async fn run_text(
    app: &AppHandle<Wry>,
    active: &ActiveWindow,
    key: Option<String>,
) -> Option<(String, &'static str)> {
    let user_text = format!(
        "The user is currently in `{}` (window title: \"{}\"). You can \
         only see this metadata — you cannot see pixels. Give ONE \
         concise, useful nudge based purely on what game/app this is \
         (a reminder, a mechanic tip, a focus suggestion). Keep it under \
         20 words. If you have nothing useful to add, reply: SKIP.",
        active.process_name, active.title,
    );
    let messages = [
        ChatMessage::system(COACH_SYSTEM.to_string()),
        ChatMessage::user(user_text.clone()),
    ];

    // 1. Local LLM if available. Reuse the chat model — these requests
    // are ~80 tokens, fast even on a 7B.
    let engine = crate::chat::build_local_engine_public(app);
    match tokio::time::timeout(
        Duration::from_secs(TEXT_TIMEOUT_SECS * 2),
        engine.complete(
            &messages,
            CompletionOptions {
                max_tokens: Some(HINT_MAX_TOKENS),
                temperature: Some(0.7),
            },
        ),
    )
    .await
    {
        Ok(Ok(raw)) if !raw.trim().is_empty() => {
            return Some((raw.trim().trim_matches('"').to_string(), "text-local"));
        }
        Ok(Err(komorebi_llm::LlmError::NotAvailable)) => {
            tracing::debug!("coach: local engine unavailable, trying cloud text fallback");
        }
        Ok(Err(e)) => {
            tracing::debug!(
                ?e,
                "coach: local engine errored, trying cloud text fallback"
            );
        }
        Ok(Ok(_)) => {
            tracing::debug!("coach: local engine returned empty, trying cloud text fallback");
        }
        Err(_) => {
            tracing::debug!("coach: local engine timed out, trying cloud text fallback");
        }
    }

    // 2. Cloud text fallback (NO vision, just chat completion).
    let key = key?;
    let model = settings::get_game_coach_model(app);
    let client = match OpenRouterClient::new(key) {
        Ok(c) => c,
        Err(e) => {
            tracing::debug!(?e, "coach: cloud client init failed");
            return None;
        }
    };
    let raw = match tokio::time::timeout(
        Duration::from_secs(TEXT_TIMEOUT_SECS),
        client.complete_text(&model, COACH_SYSTEM, &user_text, HINT_MAX_TOKENS),
    )
    .await
    {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => {
            tracing::debug!(?e, "coach: cloud text call failed");
            return None;
        }
        Err(_) => {
            tracing::debug!("coach: cloud text call timed out");
            return None;
        }
    };
    Some((raw.trim().trim_matches('"').to_string(), "text-cloud"))
}

fn downscale_png(png: &[u8], target_width: u32) -> Option<Vec<u8>> {
    let img = image::load_from_memory(png).ok()?;
    let w = img.width();
    if w <= target_width {
        return Some(png.to_vec());
    }
    let ratio = target_width as f32 / w as f32;
    let nh = (img.height() as f32 * ratio) as u32;
    let small = image::imageops::resize(
        &img.to_rgb8(),
        target_width,
        nh.max(1),
        image::imageops::FilterType::Triangle,
    );
    let mut out = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(small)
        .write_to(&mut out, image::ImageFormat::Png)
        .ok()?;
    Some(out.into_inner())
}
