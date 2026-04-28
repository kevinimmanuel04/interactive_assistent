//! Settings persistence via `tauri-plugin-store`.
//!
//! Phase 1 storage choice: the API key lives in a JSON store encrypted only
//! by the OS file permissions on the app-data dir. Upgrade path to OS keyring
//! is planned for Phase 3 hardening.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime, Wry};
use tauri_plugin_store::StoreExt;

type Result<T> = anyhow::Result<T>;

const STORE_FILE: &str = "settings.json";
const KEY_OPENROUTER_API: &str = "openrouter_api_key";
const KEY_OPENROUTER_MODEL: &str = "openrouter_model";
const KEY_MODE: &str = "mode";
const KEY_LOCAL_MODEL_PATH: &str = "local_model_path";
const KEY_TTS_ENABLED: &str = "tts_enabled";
const KEY_PIPER_BINARY: &str = "piper_binary_path";
const KEY_PIPER_VOICE: &str = "piper_voice_path";
const KEY_LIVE2D_MODEL_URL: &str = "live2d_model_url";
const KEY_WHISPER_MODEL_PATH: &str = "whisper_model_path";
const KEY_WAKE_WORD: &str = "wake_word";
const KEY_LISTEN_ENABLED: &str = "listen_enabled";
const KEY_SMART_ROUTING: &str = "smart_routing";
const KEY_CLASSIFIER_MODEL: &str = "classifier_model";
const KEY_RAG_ENABLED: &str = "rag_enabled";
const KEY_AUDIO_INPUT: &str = "audio_input_device";
const KEY_AUDIO_OUTPUT: &str = "audio_output_device";
const KEY_GPU_LAYERS: &str = "llm_gpu_layers";
const KEY_AUTO_LISTEN: &str = "auto_listen";
const KEY_TTS_PROVIDER: &str = "tts_provider";
const KEY_TTS_LENGTH_SCALE: &str = "tts_length_scale";
const KEY_TTS_NOISE_SCALE: &str = "tts_noise_scale";
const KEY_TTS_NOISE_W: &str = "tts_noise_w";
const KEY_TTS_VOLUME: &str = "tts_volume";
const KEY_SOVITS_ENDPOINT: &str = "sovits_endpoint";
const KEY_SOVITS_REF_AUDIO: &str = "sovits_ref_audio";
const KEY_SOVITS_PROMPT_TEXT: &str = "sovits_prompt_text";
const KEY_SOVITS_PROMPT_LANG: &str = "sovits_prompt_lang";
const KEY_SOVITS_TEXT_LANG: &str = "sovits_text_lang";
const KEY_SOVITS_SPEED: &str = "sovits_speed";
const KEY_AGENT_WORKSPACE: &str = "agent_workspace";
const KEY_PROACTIVE_ENABLED: &str = "proactive_enabled";
const KEY_DESKTOP_AUTOMATION: &str = "desktop_automation_enabled";
const KEY_OPENROUTER_TTS_ENABLED: &str = "openrouter_tts_enabled";
const KEY_OPENROUTER_TTS_MODEL: &str = "openrouter_tts_model";
const KEY_OPENROUTER_TTS_VOICE: &str = "openrouter_tts_voice";
const KEY_OPENROUTER_STT_ENABLED: &str = "openrouter_stt_enabled";
const KEY_OPENROUTER_STT_MODEL: &str = "openrouter_stt_model";
const KEY_GAME_COACH_ENABLED: &str = "game_coach_enabled";
const KEY_GAME_COACH_MODEL: &str = "game_coach_model";
const KEY_FASTER_WHISPER_ENABLED: &str = "faster_whisper_enabled";
const KEY_FASTER_WHISPER_URL: &str = "faster_whisper_url";
const KEY_FASTER_WHISPER_MODEL: &str = "faster_whisper_model";
const KEY_FASTER_WHISPER_LANGUAGE: &str = "faster_whisper_language";
const KEY_DEEPGRAM_API: &str = "deepgram_api_key";
const KEY_DEEPGRAM_ENABLED: &str = "deepgram_enabled";
const KEY_DEEPGRAM_MODEL: &str = "deepgram_model";
const KEY_DEEPGRAM_LANGUAGE: &str = "deepgram_language";

pub const DEFAULT_OPENROUTER_TTS_MODEL: &str = "openai/gpt-4o-audio-preview";
pub const DEFAULT_OPENROUTER_TTS_VOICE: &str = "alloy";
pub const DEFAULT_OPENROUTER_STT_MODEL: &str = "openai/gpt-4o-audio-preview";
pub const DEFAULT_GAME_COACH_MODEL: &str = "openai/gpt-4o-mini";
pub const DEFAULT_FASTER_WHISPER_URL: &str = "http://localhost:8000";
pub const DEFAULT_FASTER_WHISPER_MODEL: &str = "Systran/faster-whisper-base";
pub const DEFAULT_DEEPGRAM_MODEL: &str = "nova-3";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicSettings {
    pub has_openrouter_key: bool,
    pub openrouter_model: String,
    pub mode: String,
    pub local_model_path: Option<String>,
    pub tts_enabled: bool,
    pub piper_binary_path: Option<String>,
    pub piper_voice_path: Option<String>,
    pub live2d_model_url: Option<String>,
    pub whisper_model_path: Option<String>,
    pub stt_available: bool,
    pub wake_word: Option<String>,
    pub listen_enabled: bool,
    pub smart_routing: bool,
    pub classifier_model: String,
    pub rag_enabled: bool,
    pub audio_input_device: Option<String>,
    pub audio_output_device: Option<String>,
    pub llm_gpu_layers: Option<i64>,
    pub auto_listen: bool,
    pub tts_provider: String,
    pub tts_length_scale: Option<f64>,
    pub tts_noise_scale: Option<f64>,
    pub tts_noise_w: Option<f64>,
    pub tts_volume: f64,
    pub sovits_endpoint: Option<String>,
    pub sovits_ref_audio: Option<String>,
    pub sovits_prompt_text: Option<String>,
    pub sovits_prompt_lang: String,
    pub sovits_text_lang: String,
    pub sovits_speed: f64,
    pub agent_workspace: Option<String>,
    pub proactive_enabled: bool,
    pub desktop_automation_enabled: bool,
    pub openrouter_tts_enabled: bool,
    pub openrouter_tts_model: String,
    pub openrouter_tts_voice: String,
    pub openrouter_stt_enabled: bool,
    pub openrouter_stt_model: String,
    pub game_coach_enabled: bool,
    pub game_coach_model: String,
    pub faster_whisper_enabled: bool,
    pub faster_whisper_url: String,
    pub faster_whisper_model: String,
    pub faster_whisper_language: Option<String>,
    pub has_deepgram_key: bool,
    pub deepgram_enabled: bool,
    pub deepgram_model: String,
    pub deepgram_language: Option<String>,
}

pub fn get_openrouter_key(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_OPENROUTER_API)
}

pub fn set_openrouter_key<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    if key.trim().is_empty() {
        store.delete(KEY_OPENROUTER_API);
    } else {
        store.set(
            KEY_OPENROUTER_API,
            serde_json::Value::String(key.to_string()),
        );
    }
    store.save()?;
    Ok(())
}

pub fn get_openrouter_model(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_OPENROUTER_MODEL)
        .unwrap_or_else(|| komorebi_cloud::DEFAULT_MODEL.to_string())
}

pub fn set_openrouter_model<R: Runtime>(app: &AppHandle<R>, model: &str) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    let trimmed = model.trim();
    if trimmed.is_empty() {
        store.delete(KEY_OPENROUTER_MODEL);
    } else {
        store.set(KEY_OPENROUTER_MODEL, trimmed.to_string());
    }
    store.save()?;
    Ok(())
}

pub fn get_mode(app: &AppHandle<Wry>) -> komorebi_router::Mode {
    match read_string(app, KEY_MODE).as_deref() {
        Some("local") => komorebi_router::Mode::Local,
        Some("cloud") => komorebi_router::Mode::Cloud,
        _ => komorebi_router::Mode::Auto,
    }
}

pub fn set_mode<R: Runtime>(app: &AppHandle<R>, mode: komorebi_router::Mode) -> Result<()> {
    let v = match mode {
        komorebi_router::Mode::Auto => "auto",
        komorebi_router::Mode::Local => "local",
        komorebi_router::Mode::Cloud => "cloud",
    };
    let store = app.store(STORE_FILE)?;
    store.set(KEY_MODE, serde_json::Value::String(v.into()));
    store.save()?;
    Ok(())
}

#[allow(dead_code)] // used by chat::stream_local when the `local-llm` feature is on
pub fn get_local_model_path(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_LOCAL_MODEL_PATH)
}

pub fn set_local_model_path<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    if path.trim().is_empty() {
        store.delete(KEY_LOCAL_MODEL_PATH);
    } else {
        store.set(
            KEY_LOCAL_MODEL_PATH,
            serde_json::Value::String(path.to_string()),
        );
    }
    store.save()?;
    Ok(())
}

pub fn public_snapshot(app: &AppHandle<Wry>) -> PublicSettings {
    PublicSettings {
        has_openrouter_key: get_openrouter_key(app).is_some(),
        openrouter_model: get_openrouter_model(app),
        mode: match get_mode(app) {
            komorebi_router::Mode::Auto => "auto",
            komorebi_router::Mode::Local => "local",
            komorebi_router::Mode::Cloud => "cloud",
        }
        .to_string(),
        local_model_path: read_string(app, KEY_LOCAL_MODEL_PATH),
        tts_enabled: get_tts_enabled(app),
        piper_binary_path: read_string(app, KEY_PIPER_BINARY),
        piper_voice_path: read_string(app, KEY_PIPER_VOICE),
        live2d_model_url: read_string(app, KEY_LIVE2D_MODEL_URL),
        whisper_model_path: read_string(app, KEY_WHISPER_MODEL_PATH),
        stt_available: komorebi_voice::stt::is_available(),
        wake_word: read_string(app, KEY_WAKE_WORD),
        listen_enabled: get_listen_enabled(app),
        smart_routing: get_smart_routing(app),
        classifier_model: get_classifier_model(app),
        rag_enabled: get_rag_enabled(app),
        audio_input_device: read_string(app, KEY_AUDIO_INPUT),
        audio_output_device: read_string(app, KEY_AUDIO_OUTPUT),
        llm_gpu_layers: get_gpu_layers(app),
        auto_listen: get_auto_listen(app),
        tts_provider: get_tts_provider(app),
        tts_length_scale: get_f64(app, KEY_TTS_LENGTH_SCALE),
        tts_noise_scale: get_f64(app, KEY_TTS_NOISE_SCALE),
        tts_noise_w: get_f64(app, KEY_TTS_NOISE_W),
        tts_volume: get_f64(app, KEY_TTS_VOLUME).unwrap_or(1.0),
        sovits_endpoint: read_string(app, KEY_SOVITS_ENDPOINT),
        sovits_ref_audio: read_string(app, KEY_SOVITS_REF_AUDIO),
        sovits_prompt_text: read_string(app, KEY_SOVITS_PROMPT_TEXT),
        sovits_prompt_lang: read_string(app, KEY_SOVITS_PROMPT_LANG).unwrap_or_else(|| "ja".into()),
        sovits_text_lang: read_string(app, KEY_SOVITS_TEXT_LANG).unwrap_or_else(|| "auto".into()),
        sovits_speed: get_f64(app, KEY_SOVITS_SPEED).unwrap_or(1.0),
        agent_workspace: read_string(app, KEY_AGENT_WORKSPACE),
        proactive_enabled: get_bool(app, KEY_PROACTIVE_ENABLED, false),
        desktop_automation_enabled: get_bool(app, KEY_DESKTOP_AUTOMATION, false),
        openrouter_tts_enabled: get_openrouter_tts_enabled(app),
        openrouter_tts_model: get_openrouter_tts_model(app),
        openrouter_tts_voice: get_openrouter_tts_voice(app),
        openrouter_stt_enabled: get_openrouter_stt_enabled(app),
        openrouter_stt_model: get_openrouter_stt_model(app),
        game_coach_enabled: get_game_coach_enabled(app),
        game_coach_model: get_game_coach_model(app),
        faster_whisper_enabled: get_faster_whisper_enabled(app),
        faster_whisper_url: get_faster_whisper_url(app),
        faster_whisper_model: get_faster_whisper_model(app),
        faster_whisper_language: get_faster_whisper_language(app),
        has_deepgram_key: get_deepgram_key(app).is_some(),
        deepgram_enabled: get_deepgram_enabled(app),
        deepgram_model: get_deepgram_model(app),
        deepgram_language: get_deepgram_language(app),
    }
}

pub fn get_audio_input(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_AUDIO_INPUT)
}

pub fn set_audio_input<R: Runtime>(app: &AppHandle<R>, name: &str) -> Result<()> {
    write_optional_string(app, KEY_AUDIO_INPUT, name)
}

pub fn set_audio_output<R: Runtime>(app: &AppHandle<R>, name: &str) -> Result<()> {
    write_optional_string(app, KEY_AUDIO_OUTPUT, name)
}

/// `None` means "auto" (use GPU if available, otherwise CPU). `Some(0)`
/// forces CPU; `Some(n > 0)` offloads n layers to GPU; `Some(-1)` offloads
/// everything. Only meaningful when the `local-llm` feature is compiled
/// with a GPU backend (CUDA / Vulkan).
pub fn get_gpu_layers(app: &AppHandle<Wry>) -> Option<i64> {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(KEY_GPU_LAYERS))
        .and_then(|v| v.as_i64())
}

pub fn set_gpu_layers<R: Runtime>(app: &AppHandle<R>, layers: Option<i64>) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    match layers {
        Some(n) => store.set(KEY_GPU_LAYERS, serde_json::Value::from(n)),
        None => {
            store.delete(KEY_GPU_LAYERS);
        }
    }
    store.save()?;
    Ok(())
}

pub fn get_auto_listen(app: &AppHandle<Wry>) -> bool {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(KEY_AUTO_LISTEN))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub fn set_auto_listen<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_AUTO_LISTEN, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
}

pub fn get_whisper_model_path(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_WHISPER_MODEL_PATH)
}

pub fn set_whisper_model_path<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<()> {
    write_optional_string(app, KEY_WHISPER_MODEL_PATH, path)
}

pub fn set_wake_word<R: Runtime>(app: &AppHandle<R>, phrase: &str) -> Result<()> {
    write_optional_string(app, KEY_WAKE_WORD, phrase)
}

pub fn get_listen_enabled(app: &AppHandle<Wry>) -> bool {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(KEY_LISTEN_ENABLED))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub fn set_listen_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_LISTEN_ENABLED, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
}

pub fn get_smart_routing(app: &AppHandle<Wry>) -> bool {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(KEY_SMART_ROUTING))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub fn set_smart_routing<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_SMART_ROUTING, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
}

pub fn get_classifier_model(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_CLASSIFIER_MODEL)
        .unwrap_or_else(|| komorebi_cloud::DEFAULT_CLASSIFIER_MODEL.to_string())
}

pub fn set_classifier_model<R: Runtime>(app: &AppHandle<R>, model: &str) -> Result<()> {
    write_optional_string(app, KEY_CLASSIFIER_MODEL, model)
}

pub fn get_rag_enabled(app: &AppHandle<Wry>) -> bool {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(KEY_RAG_ENABLED))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub fn set_rag_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_RAG_ENABLED, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
}

pub fn get_tts_enabled(app: &AppHandle<Wry>) -> bool {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(KEY_TTS_ENABLED))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub fn set_tts_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_TTS_ENABLED, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
}

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

pub fn set_live2d_model_url<R: Runtime>(app: &AppHandle<R>, url: &str) -> Result<()> {
    write_optional_string(app, KEY_LIVE2D_MODEL_URL, url)
}

fn write_optional_string<R: Runtime>(app: &AppHandle<R>, key: &str, value: &str) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    if value.trim().is_empty() {
        store.delete(key);
    } else {
        store.set(key, serde_json::Value::String(value.to_string()));
    }
    store.save()?;
    Ok(())
}

fn read_string(app: &AppHandle<Wry>, key: &str) -> Option<String> {
    let store = app.store(STORE_FILE).ok()?;
    store.get(key).and_then(|v| v.as_str().map(str::to_string))
}

fn get_f64(app: &AppHandle<Wry>, key: &str) -> Option<f64> {
    let store = app.store(STORE_FILE).ok()?;
    store.get(key).and_then(|v| v.as_f64())
}

fn write_optional_f64<R: Runtime>(app: &AppHandle<R>, key: &str, value: Option<f64>) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    match value {
        Some(n) if n.is_finite() => store.set(key, serde_json::Value::from(n)),
        _ => {
            store.delete(key);
        }
    }
    store.save()?;
    Ok(())
}

// --- TTS provider selection & prosody -------------------------------------

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

pub fn set_tts_volume<R: Runtime>(app: &AppHandle<R>, v: f64) -> Result<()> {
    let clamped = v.clamp(0.0, 2.0);
    write_optional_f64(app, KEY_TTS_VOLUME, Some(clamped))
}

// --- SoVITS settings ------------------------------------------------------

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

// --- Agent / automation ---------------------------------------------------

fn get_bool(app: &AppHandle<Wry>, key: &str, default: bool) -> bool {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(key))
        .and_then(|v| v.as_bool())
        .unwrap_or(default)
}

pub fn get_agent_workspace(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_AGENT_WORKSPACE)
}
pub fn set_agent_workspace<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<()> {
    write_optional_string(app, KEY_AGENT_WORKSPACE, path)
}

pub fn get_proactive_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_PROACTIVE_ENABLED, false)
}
pub fn set_proactive_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_PROACTIVE_ENABLED, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
}

pub fn get_desktop_automation_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_DESKTOP_AUTOMATION, false)
}
pub fn set_desktop_automation_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_DESKTOP_AUTOMATION, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
}

// --- OpenRouter TTS / STT -------------------------------------------------

pub fn get_openrouter_tts_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_OPENROUTER_TTS_ENABLED, false)
}
pub fn set_openrouter_tts_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_OPENROUTER_TTS_ENABLED, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
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

pub fn get_openrouter_stt_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_OPENROUTER_STT_ENABLED, false)
}
pub fn set_openrouter_stt_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_OPENROUTER_STT_ENABLED, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
}

pub fn get_openrouter_stt_model(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_OPENROUTER_STT_MODEL)
        .unwrap_or_else(|| DEFAULT_OPENROUTER_STT_MODEL.to_string())
}
pub fn set_openrouter_stt_model<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_OPENROUTER_STT_MODEL, v)
}

// --- Game Coach -----------------------------------------------------------

pub fn get_game_coach_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_GAME_COACH_ENABLED, false)
}
pub fn set_game_coach_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_GAME_COACH_ENABLED, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
}

pub fn get_game_coach_model(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_GAME_COACH_MODEL).unwrap_or_else(|| DEFAULT_GAME_COACH_MODEL.to_string())
}
pub fn set_game_coach_model<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_GAME_COACH_MODEL, v)
}

// --- Faster-Whisper -------------------------------------------------------

pub fn get_faster_whisper_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_FASTER_WHISPER_ENABLED, false)
}
pub fn set_faster_whisper_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_FASTER_WHISPER_ENABLED, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
}

pub fn get_faster_whisper_url(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_FASTER_WHISPER_URL)
        .unwrap_or_else(|| DEFAULT_FASTER_WHISPER_URL.to_string())
}
pub fn set_faster_whisper_url<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_FASTER_WHISPER_URL, v)
}

pub fn get_faster_whisper_model(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_FASTER_WHISPER_MODEL)
        .unwrap_or_else(|| DEFAULT_FASTER_WHISPER_MODEL.to_string())
}
pub fn set_faster_whisper_model<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_FASTER_WHISPER_MODEL, v)
}

pub fn get_faster_whisper_language(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_FASTER_WHISPER_LANGUAGE)
}
pub fn set_faster_whisper_language<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_FASTER_WHISPER_LANGUAGE, v)
}

// --- Deepgram -------------------------------------------------------------

pub fn get_deepgram_key(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_DEEPGRAM_API)
}
pub fn set_deepgram_key<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    if key.trim().is_empty() {
        store.delete(KEY_DEEPGRAM_API);
    } else {
        store.set(
            KEY_DEEPGRAM_API,
            serde_json::Value::String(key.trim().to_string()),
        );
    }
    store.save()?;
    Ok(())
}

pub fn get_deepgram_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_DEEPGRAM_ENABLED, false)
}
pub fn set_deepgram_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY_DEEPGRAM_ENABLED, serde_json::Value::Bool(on));
    store.save()?;
    Ok(())
}

pub fn get_deepgram_model(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_DEEPGRAM_MODEL).unwrap_or_else(|| DEFAULT_DEEPGRAM_MODEL.to_string())
}
pub fn set_deepgram_model<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_DEEPGRAM_MODEL, v)
}

pub fn get_deepgram_language(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_DEEPGRAM_LANGUAGE)
}
pub fn set_deepgram_language<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_DEEPGRAM_LANGUAGE, v)
}
