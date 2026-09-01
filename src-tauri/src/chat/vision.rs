//! Vision (image+text) generation: downscaling and OpenRouter dispatch.

use super::events::{emit, ChatEventOut};
use super::speak::maybe_speak;
use super::ChatService;
use crate::settings;
use april_cloud::OpenRouterClient;
use april_router::ChatMessage;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{AppHandle, Manager, Wry};

pub(super) async fn run_vision_generation(
    app: AppHandle<Wry>,
    id: String,
    prompt: String,
    png_bytes: Vec<u8>,
) -> Result<(), String> {
    let service: Arc<ChatService> = app
        .try_state::<Arc<ChatService>>()
        .ok_or_else(|| "chat service not initialized".to_string())?
        .inner()
        .clone();
    service.cancel.store(false, Ordering::SeqCst);

    let key = settings::get_openrouter_key(&app).ok_or_else(|| {
        "OpenRouter API key required for vision. Add one in settings.".to_string()
    })?;
    let primary_model = settings::get_game_coach_model(&app);
    let candidate_models = if key.starts_with("sk-or-") {
        vec![
            primary_model.as_str(),
            "google/gemini-2.5-flash",
            "openai/gpt-4o-mini",
            "anthropic/claude-3.5-sonnet",
        ]
    } else {
        vec![
            "mimo-v2.5-free",
            "deepseek-v4-flash-free",
            "nemotron-3.5-lightning-free",
            "hy3-free",
        ]
    };

    emit(
        &app,
        ChatEventOut::Started {
            id: id.clone(),
            route: "cloud".into(),
            model_label: None,
        },
    );

    let user_text = if prompt.trim().is_empty() {
        "Describe briefly what you see in this image.".to_string()
    } else {
        prompt.clone()
    };

    // Token-budget the image: vision models bill per pixel-area; downscale
    // to ~1280px wide so a 4K screenshot doesn't burn 4× the tokens.
    let small = downscale_for_vision(&png_bytes, 1280).unwrap_or(png_bytes);

    let client = OpenRouterClient::new(key).map_err(|e| e.to_string())?;
    
    let mut raw_res = None;
    let mut last_err = String::new();

    const SYSTEM_PROMPT: &str = "You are April, a cheerful and intelligent assistant looking at \
        the user's screen or attached image. Reply concisely (1-4 \
        sentences) in the user's language; describe what you see and \
        answer their question if any. ALWAYS prepend EXACTLY ONE of \
        these tags as the very first characters: <mood:neutral> \
        <mood:happy> <mood:sad> <mood:angry> <mood:surprised> \
        <mood:thinking>. Never explain the tag. Never speak it aloud.";

    for m in candidate_models {
        match client.complete_vision(m, SYSTEM_PROMPT, &user_text, &small, 400).await {
            Ok(res) if !res.trim().is_empty() => {
                raw_res = Some(res);
                break;
            }
            Ok(_) => {
                last_err = format!("Model {m} returned empty response");
            }
            Err(e) => {
                last_err = format!("Model {m} error: {e}");
            }
        }
    }

    let raw = raw_res.ok_or_else(|| format!("All vision models failed. Last error: {last_err}"))?;

    emit(
        &app,
        ChatEventOut::Token {
            id: id.clone(),
            text: raw.clone(),
        },
    );

    {
        let mut hist = service.history.lock().await;
        // Synthetic user turn: keeps the LLM aware in subsequent text-only
        // turns that an image was discussed.
        hist.push(ChatMessage::user(format!(
            "[смотрит на экран/картинку] {prompt}"
        )));
        hist.push(ChatMessage::assistant(raw.clone()));
    }
    emit(
        &app,
        ChatEventOut::Done {
            id,
            full_text: raw.clone(),
        },
    );
    maybe_speak(&app, raw).await;
    Ok(())
}

/// Downscale a PNG to at most `max_width` pixels wide, preserving aspect
/// ratio. Returns `None` if decoding fails (caller should fall back to
/// the original bytes). Public so `tools.rs` can reuse it.
pub fn downscale_for_vision(png: &[u8], max_width: u32) -> Option<Vec<u8>> {
    let img = image::load_from_memory(png).ok()?;
    let w = img.width();
    if w <= max_width {
        return Some(png.to_vec());
    }
    let ratio = max_width as f32 / w as f32;
    let nh = (img.height() as f32 * ratio) as u32;
    let small = image::imageops::resize(
        &img.to_rgb8(),
        max_width,
        nh.max(1),
        image::imageops::FilterType::Triangle,
    );
    let mut out = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(small)
        .write_to(&mut out, image::ImageFormat::Png)
        .ok()?;
    Some(out.into_inner())
}
