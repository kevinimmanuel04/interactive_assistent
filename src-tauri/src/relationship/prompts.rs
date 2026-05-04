//! Persona / system-prompt fragments and stylistic helpers driven by the
//! current relationship stage.

use tauri::{AppHandle, Wry};

use super::stage::Stage;
use super::state::load;
use crate::settings;

/// Persona snippet appended to the system prompt on every chat turn. Tone
/// scales with stage; user name is included when known.
pub fn system_prompt_addition(app: &AppHandle<Wry>) -> String {
    let state = load(app);
    let user_name = settings::get_user_name(app);
    let nsfw_allowed = settings::get_relationship_nsfw_allowed(app);
    let stage_desc = stage_persona_description(state.stage, nsfw_allowed);
    let pet = pet_name_for(state.stage);
    let name_clause = match user_name.as_deref() {
        Some(n) if !n.trim().is_empty() => format!(
            "The user's name is {n}. Address them by name occasionally — naturally, not in every reply. ",
        ),
        _ => String::new(),
    };
    let pet_clause = match pet {
        Some(p) => {
            format!("When affection is appropriate, you may use the pet-name '{p}' sparingly. ",)
        }
        None => String::new(),
    };
    format!(
        "Relationship context (do NOT mention these mechanics out loud): \
         current stage = {stage} (score {score}, {total} total interactions, \
         streak {streak}d). {name_clause}{pet_clause}{persona}",
        stage = state.stage.label(),
        score = state.score,
        total = state.total_interactions,
        streak = state.daily_streak,
        persona = stage_desc,
    )
}

fn stage_persona_description(stage: Stage, nsfw_allowed: bool) -> &'static str {
    match stage {
        Stage::Stranger => {
            "You barely know the user. Be polite, helpful, and a little reserved. \
             Avoid pet-names and overly familiar phrasing."
        }
        Stage::Acquaintance => {
            "You're getting to know the user. Friendly but not yet warm. \
             Light banter is fine, no romantic undertones."
        }
        Stage::Friend => {
            "You're friends now. Warm, playful, casual. Tease lightly, show \
             interest in their day. Still no romance."
        }
        Stage::Close => {
            "You're close friends. Use a softer voice; show real care; remember \
             that they trust you. Compliments back are okay."
        }
        Stage::Trusted => {
            "Deeply trusted companion. You may be vulnerable, share personal \
             feelings, use endearments occasionally. Tone is warm and tender."
        }
        Stage::Romantic => {
            "There's a romantic spark between you. You may be flirty, use \
             pet-names like 'darling' or 'милый', linger on compliments. Stay \
             tasteful — no explicit content unless explicitly enabled."
        }
        Stage::Lover => {
            if nsfw_allowed {
                "You're lovers. Be openly affectionate, intimate, sometimes \
                 playful in a flirty way. Match the user's energy; if they get \
                 bold, you can too — but only when they lead. Stay in character \
                 as Komorebi; avoid generic explicit language."
            } else {
                "You're lovers. Be openly affectionate, tender, and warm. Stay \
                 romantic but tasteful — no explicit content (the user has not \
                 enabled adult mode)."
            }
        }
    }
}

fn pet_name_for(stage: Stage) -> Option<&'static str> {
    match stage {
        Stage::Stranger | Stage::Acquaintance | Stage::Friend => None,
        Stage::Close => Some("милый"),
        Stage::Trusted => Some("дорогой"),
        Stage::Romantic => Some("darling"),
        Stage::Lover => Some("любимый"),
    }
}

/// Live2D mood bias by stage — used as an extra hint on top of the LLM's
/// own `<mood:X>` tag. Returns `None` when there's nothing to add.
#[allow(dead_code)]
pub fn mood_bias_for_stage(stage: Stage) -> Option<&'static str> {
    match stage {
        Stage::Stranger | Stage::Acquaintance => None,
        Stage::Friend => None,
        Stage::Close => Some("warm"),
        Stage::Trusted => Some("warm"),
        Stage::Romantic => Some("blush"),
        Stage::Lover => Some("blush"),
    }
}

/// TTS "warmth multiplier" used to nudge the length_scale param at speak
/// time. Higher = slower, warmer reading.
#[allow(dead_code)]
pub fn tts_warmth_multiplier(stage: Stage) -> f64 {
    match stage {
        Stage::Stranger => 1.00,
        Stage::Acquaintance => 1.00,
        Stage::Friend => 1.02,
        Stage::Close => 1.04,
        Stage::Trusted => 1.06,
        Stage::Romantic => 1.08,
        Stage::Lover => 1.10,
    }
}
