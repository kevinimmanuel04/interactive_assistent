//! Game Coach mode (v1.1).
//!
//! When the active foreground app classifies as `AppKind::Game` (or is
//! fullscreen in general) AND the user has opted into coach mode, we
//! periodically:
//!   1. Capture the primary monitor as PNG.
//!   2. Send it to a vision-capable OpenRouter model (default
//!      `openai/gpt-4o-mini` — cheap, fast, decent at game UIs).
//!   3. Ask for one short tactical hint based on what's on screen.
//!   4. Emit a `chat:coach` event the frontend renders as a coach
//!      bubble — separate channel from the regular chat so it never
//!      interrupts an in-progress reply.
//!
//! Cooldown is intentionally generous (~75 s by default) so we don't
//! spam the user or rack up vision-API spend.

use crate::settings;
use komorebi_cloud::OpenRouterClient;
use komorebi_desktop::{capture, procs, AppKind};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Wry};

const POLL_SECS: u64 = 30;
const COOLDOWN_SECS: u64 = 75;

#[derive(serde::Serialize, Clone)]
pub struct CoachPayload {
    pub game: String,
    pub hint: String,
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
            // Only run when the user is in a game/fullscreen.
            let Some(active) = procs::active_window() else {
                continue;
            };
            let in_game = active.kind == AppKind::Game || active.is_fullscreen;
            if !in_game {
                continue;
            }
            let Some(key) = settings::get_openrouter_key(&app) else {
                continue;
            };
            let model = settings::get_game_coach_model(&app);

            // Capture screen on a blocking thread to avoid stalling the
            // tokio worker (xcap is sync).
            let png = match tokio::task::spawn_blocking(|| capture::capture_screen(0)).await {
                Ok(Ok(b)) => b,
                Ok(Err(e)) => {
                    tracing::debug!(?e, "coach: capture failed");
                    continue;
                }
                Err(e) => {
                    tracing::debug!(?e, "coach: capture join failed");
                    continue;
                }
            };

            // Downsize the PNG before sending: we re-encode at ~960px wide
            // to keep tokens cheap. xcap returns native resolution which
            // can be 4K → 12 MB — way more than the model needs.
            let small = match downscale_png(&png, 960) {
                Some(p) => p,
                None => png,
            };

            let client = match OpenRouterClient::new(key) {
                Ok(c) => c,
                Err(e) => {
                    tracing::debug!(?e, "coach: client init failed");
                    continue;
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
                Duration::from_secs(15),
                client.complete_vision(
                    &model,
                    "You are a friendly co-op gaming coach watching a single \
                     screenshot of the player's screen. You speak the user's \
                     language. You never lie about what you see. You keep \
                     hints short — one sentence.",
                    &user_text,
                    &small,
                    80,
                ),
            )
            .await
            {
                Ok(Ok(s)) => s,
                Ok(Err(e)) => {
                    tracing::debug!(?e, "coach: vision call failed");
                    continue;
                }
                Err(_) => {
                    tracing::debug!("coach: vision call timed out");
                    continue;
                }
            };

            let hint = raw.trim().trim_matches('"').to_string();
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
                },
            );
            last_fired = Instant::now();
            tracing::info!(game = %active.process_name, hint = %hint, "coach tip emitted");
        }
    });
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
