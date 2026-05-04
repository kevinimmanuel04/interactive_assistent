//! Text-to-speech configuration: provider selection, Piper paths,
//! prosody knobs, SoVITS endpoint, OpenRouter TTS, master volume.

use super::defaults::{DEFAULT_OPENROUTER_TTS_MODEL, DEFAULT_OPENROUTER_TTS_VOICE};
use super::store::{
    get_bool, get_f64, read_string, write_bool, write_optional_f64, write_optional_string,
};
use super::Result;
use tauri::{AppHandle, Runtime, Wry};

const KEY_TTS_ENABLED: &str = "tts_enabled";
const KEY_TTS_PROVIDER: &str = "tts_provider";
const KEY_TTS_LENGTH_SCALE: &str = "tts_length_scale";
const KEY_TTS_NOISE_SCALE: &str = "tts_noise_scale";
const KEY_TTS_NOISE_W: &str = "tts_noise_w";
const KEY_TTS_VOLUME: &str = "tts_volume";

const KEY_PIPER_BINARY: &str = "piper_binary_path";
const KEY_PIPER_VOICE: &str = "piper_voice_path";

const KEY_SOVITS_ENDPOINT: &str = "sovits_endpoint";
const KEY_SOVITS_REF_AUDIO: &str = "sovits_ref_audio";
const KEY_SOVITS_PROMPT_TEXT: &str = "sovits_prompt_text";
const KEY_SOVITS_PROMPT_LANG: &str = "sovits_prompt_lang";
const KEY_SOVITS_TEXT_LANG: &str = "sovits_text_lang";
const KEY_SOVITS_SPEED: &str = "sovits_speed";

const KEY_OPENROUTER_TTS_ENABLED: &str = "openrouter_tts_enabled";
const KEY_OPENROUTER_TTS_MODEL: &str = "openrouter_tts_model";
const KEY_OPENROUTER_TTS_VOICE: &str = "openrouter_tts_voice";

// --- Master TTS toggle + volume ------------------------------------------

pub fn get_tts_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_TTS_ENABLED, false)
}

pub fn set_tts_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_TTS_ENABLED, on)
}

pub fn read_tts_volume(app: &AppHandle<Wry>) -> f64 {
    get_f64(app, KEY_TTS_VOLUME).unwrap_or(1.0)
}

pub fn set_tts_volume<R: Runtime>(app: &AppHandle<R>, v: f64) -> Result<()> {
    let clamped = v.clamp(0.0, 2.0);
    write_optional_f64(app, KEY_TTS_VOLUME, Some(clamped))
}

// --- Provider selection --------------------------------------------------

pub fn get_tts_provider(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_TTS_PROVIDER).unwrap_or_else(|| "piper".into())
}

pub fn set_tts_provider<R: Runtime>(app: &AppHandle<R>, provider: &str) -> Result<()> {
    // Sanity: only allow known providers.
    let p = match provider {
        "piper" | "sovits" | "openrouter" => provider,
        _ => "piper",
    };
    write_optional_string(app, KEY_TTS_PROVIDER, p)
}

// --- Prosody knobs (Piper) -----------------------------------------------

pub fn get_tts_length_scale(app: &AppHandle<Wry>) -> Option<f64> {
    get_f64(app, KEY_TTS_LENGTH_SCALE)
}
pub fn set_tts_length_scale<R: Runtime>(app: &AppHandle<R>, v: Option<f64>) -> Result<()> {
    write_optional_f64(app, KEY_TTS_LENGTH_SCALE, v)
}

pub fn get_tts_noise_scale(app: &AppHandle<Wry>) -> Option<f64> {
    get_f64(app, KEY_TTS_NOISE_SCALE)
}
pub fn set_tts_noise_scale<R: Runtime>(app: &AppHandle<R>, v: Option<f64>) -> Result<()> {
    write_optional_f64(app, KEY_TTS_NOISE_SCALE, v)
}

pub fn get_tts_noise_w(app: &AppHandle<Wry>) -> Option<f64> {
    get_f64(app, KEY_TTS_NOISE_W)
}
pub fn set_tts_noise_w<R: Runtime>(app: &AppHandle<R>, v: Option<f64>) -> Result<()> {
    write_optional_f64(app, KEY_TTS_NOISE_W, v)
}

// --- Piper paths ----------------------------------------------------------

pub fn get_piper_binary(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_PIPER_BINARY)
}

pub fn set_piper_binary<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<()> {
    write_optional_string(app, KEY_PIPER_BINARY, path)
}

pub fn get_piper_voice(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_PIPER_VOICE)
}

pub fn set_piper_voice<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<()> {
    write_optional_string(app, KEY_PIPER_VOICE, path)
}

// --- SoVITS ---------------------------------------------------------------

pub fn get_sovits_config(app: &AppHandle<Wry>) -> Option<komorebi_voice::sovits::SoVitsConfig> {
    let endpoint = read_string(app, KEY_SOVITS_ENDPOINT)?;
    if endpoint.trim().is_empty() {
        return None;
    }
    let ref_audio = read_string(app, KEY_SOVITS_REF_AUDIO).unwrap_or_default();
    let prompt_text = read_string(app, KEY_SOVITS_PROMPT_TEXT).unwrap_or_default();
    let prompt_lang = read_string(app, KEY_SOVITS_PROMPT_LANG).unwrap_or_else(|| "ja".into());
    let text_lang = read_string(app, KEY_SOVITS_TEXT_LANG).unwrap_or_else(|| "auto".into());
    let speed = get_f64(app, KEY_SOVITS_SPEED).unwrap_or(1.0) as f32;
    Some(komorebi_voice::sovits::SoVitsConfig {
        endpoint,
        ref_audio_path: ref_audio,
        prompt_text,
        prompt_lang,
        text_lang,
        speed,
    })
}

pub fn read_sovits_endpoint(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_SOVITS_ENDPOINT)
}

pub fn read_sovits_ref_audio(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_SOVITS_REF_AUDIO)
}

pub fn read_sovits_prompt_text(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_SOVITS_PROMPT_TEXT)
}

pub fn read_sovits_prompt_lang(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_SOVITS_PROMPT_LANG).unwrap_or_else(|| "ja".into())
}

pub fn read_sovits_text_lang(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_SOVITS_TEXT_LANG).unwrap_or_else(|| "auto".into())
}

pub fn read_sovits_speed(app: &AppHandle<Wry>) -> f64 {
    get_f64(app, KEY_SOVITS_SPEED).unwrap_or(1.0)
}

pub fn set_sovits_endpoint<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_SOVITS_ENDPOINT, v)
}
pub fn set_sovits_ref_audio<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_SOVITS_REF_AUDIO, v)
}
pub fn set_sovits_prompt_text<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_SOVITS_PROMPT_TEXT, v)
}
pub fn set_sovits_prompt_lang<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_SOVITS_PROMPT_LANG, v)
}
pub fn set_sovits_text_lang<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_SOVITS_TEXT_LANG, v)
}
pub fn set_sovits_speed<R: Runtime>(app: &AppHandle<R>, v: f64) -> Result<()> {
    let clamped = v.clamp(0.25, 3.0);
    write_optional_f64(app, KEY_SOVITS_SPEED, Some(clamped))
}

// --- OpenRouter TTS -------------------------------------------------------

pub fn get_openrouter_tts_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_OPENROUTER_TTS_ENABLED, false)
}
pub fn set_openrouter_tts_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_OPENROUTER_TTS_ENABLED, on)
}

pub fn get_openrouter_tts_model(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_OPENROUTER_TTS_MODEL)
        .unwrap_or_else(|| DEFAULT_OPENROUTER_TTS_MODEL.to_string())
}
pub fn set_openrouter_tts_model<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_OPENROUTER_TTS_MODEL, v)
}

pub fn get_openrouter_tts_voice(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_OPENROUTER_TTS_VOICE)
        .unwrap_or_else(|| DEFAULT_OPENROUTER_TTS_VOICE.to_string())
}
pub fn set_openrouter_tts_voice<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_OPENROUTER_TTS_VOICE, v)
}
