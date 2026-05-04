//! Speech-to-text and audio device commands.

use crate::settings;
use tauri::{AppHandle, State, Wry};

#[tauri::command]
pub fn set_whisper_model(app: AppHandle<Wry>, path: String) -> Result<(), String> {
    settings::set_whisper_model_path(&app, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn start_recording(
    app: AppHandle<Wry>,
    recorder: State<'_, komorebi_voice::stt::Recorder>,
) -> Result<(), String> {
    let device = settings::get_audio_input(&app);
    recorder
        .start_with_device(device)
        .map_err(|e| e.to_string())
}

/// Stops capture and runs Whisper transcription (blocking on a worker thread).
#[tauri::command]
pub async fn stop_recording(
    app: AppHandle<Wry>,
    recorder: State<'_, komorebi_voice::stt::Recorder>,
) -> Result<String, String> {
    let samples = recorder.stop().map_err(|e| e.to_string())?;

    // Provider selection priority (first enabled wins):
    //   1. Deepgram (cloud, cheapest realtime)
    //   2. Faster-Whisper (local self-hosted server, ~4× faster than whisper-rs)
    //   3. OpenRouter STT (cloud, generic LLM-based)
    //   4. Local whisper-rs (bundled fallback)
    if settings::get_deepgram_enabled(&app) {
        if let Some(key) = settings::get_deepgram_key(&app) {
            let cfg = komorebi_voice::deepgram::DeepgramConfig {
                api_key: key,
                model: settings::get_deepgram_model(&app),
                language: settings::get_deepgram_language(&app),
            };
            return komorebi_voice::deepgram::transcribe(&cfg, &samples, 16_000)
                .await
                .map_err(|e| e.to_string());
        }
    }
    if settings::get_faster_whisper_enabled(&app) {
        let cfg = komorebi_voice::faster_whisper::FasterWhisperConfig {
            base_url: settings::get_faster_whisper_url(&app),
            model: settings::get_faster_whisper_model(&app),
            language: settings::get_faster_whisper_language(&app),
        };
        return komorebi_voice::faster_whisper::transcribe(&cfg, &samples, 16_000)
            .await
            .map_err(|e| e.to_string());
    }
    if settings::get_openrouter_stt_enabled(&app) {
        if let Some(key) = settings::get_openrouter_key(&app) {
            let cfg = komorebi_voice::openrouter::OpenRouterSttConfig {
                api_key: key,
                model: settings::get_openrouter_stt_model(&app),
            };
            return komorebi_voice::openrouter::transcribe(&cfg, &samples, 16_000)
                .await
                .map_err(|e| e.to_string());
        }
    }

    let model_path = settings::get_whisper_model_path(&app)
        .ok_or_else(|| "no Whisper model configured".to_string())?;
    let path = std::path::PathBuf::from(model_path);
    tauri::async_runtime::spawn_blocking(move || {
        komorebi_voice::stt::transcribe(&path, &samples).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel_recording(recorder: State<'_, komorebi_voice::stt::Recorder>) -> Result<(), String> {
    // Stop without transcribing; ignore EmptyRecording / NotRecording.
    let _ = recorder.stop();
    Ok(())
}

#[tauri::command]
pub fn set_wake_word(app: AppHandle<Wry>, phrase: String) -> Result<(), String> {
    settings::set_wake_word(&app, &phrase).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_listen_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_listen_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_auto_listen(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_auto_listen(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_openrouter_stt_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_openrouter_stt_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_openrouter_stt_model(app: AppHandle<Wry>, model: String) -> Result<(), String> {
    settings::set_openrouter_stt_model(&app, &model).map_err(|e| e.to_string())
}

// --- Faster-Whisper (self-hosted local server) ---------------------------

#[tauri::command]
pub fn set_faster_whisper_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_faster_whisper_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_faster_whisper_url(app: AppHandle<Wry>, url: String) -> Result<(), String> {
    settings::set_faster_whisper_url(&app, &url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_faster_whisper_model(app: AppHandle<Wry>, model: String) -> Result<(), String> {
    settings::set_faster_whisper_model(&app, &model).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_faster_whisper_language(app: AppHandle<Wry>, language: String) -> Result<(), String> {
    settings::set_faster_whisper_language(&app, &language).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn validate_faster_whisper(url: String) -> Result<(), String> {
    komorebi_voice::faster_whisper::validate(&url)
        .await
        .map_err(|e| e.to_string())
}

// --- Deepgram ------------------------------------------------------------

#[tauri::command]
pub fn set_deepgram_key(app: AppHandle<Wry>, key: String) -> Result<(), String> {
    settings::set_deepgram_key(&app, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_deepgram_key(app: AppHandle<Wry>) -> Result<(), String> {
    settings::set_deepgram_key(&app, "").map_err(|e| e.to_string())
}

/// Verify a candidate Deepgram API key without persisting it. The
/// frontend uses this for the "Test key" button in Settings before
/// committing the value to the store.
#[tauri::command]
pub async fn validate_deepgram_key(key: String) -> Result<(), String> {
    komorebi_voice::deepgram::validate_key(&key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_deepgram_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_deepgram_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_deepgram_model(app: AppHandle<Wry>, model: String) -> Result<(), String> {
    settings::set_deepgram_model(&app, &model).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_deepgram_language(app: AppHandle<Wry>, language: String) -> Result<(), String> {
    settings::set_deepgram_language(&app, &language).map_err(|e| e.to_string())
}

// --- Audio devices -------------------------------------------------------

/// List the available audio input & output devices so the UI can render a
/// picker. Also returns the system defaults for each direction.
#[tauri::command]
pub fn list_audio_devices() -> serde_json::Value {
    let (inputs, outputs, def_in, def_out) = komorebi_voice::stt::list_devices();
    serde_json::json!({
        "inputs": inputs,
        "outputs": outputs,
        "default_input": def_in,
        "default_output": def_out,
    })
}

#[tauri::command]
pub fn set_audio_input(app: AppHandle<Wry>, name: String) -> Result<(), String> {
    settings::set_audio_input(&app, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_audio_output(app: AppHandle<Wry>, name: String) -> Result<(), String> {
    settings::set_audio_output(&app, &name).map_err(|e| e.to_string())
}
