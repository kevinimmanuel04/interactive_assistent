//! Tauri command surface.

use crate::{chat::ChatService, models, settings};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State, Wry};

#[tauri::command]
pub fn get_settings(app: AppHandle<Wry>) -> settings::PublicSettings {
    settings::public_snapshot(&app)
}

#[tauri::command]
pub fn set_openrouter_key(app: AppHandle<Wry>, key: String) -> Result<(), String> {
    settings::set_openrouter_key(&app, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_mode(app: AppHandle<Wry>, mode: String) -> Result<(), String> {
    let m = match mode.as_str() {
        "auto" => komorebi_router::Mode::Auto,
        "local" => komorebi_router::Mode::Local,
        "cloud" => komorebi_router::Mode::Cloud,
        other => return Err(format!("unknown mode: {other}")),
    };
    settings::set_mode(&app, m).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn send_message(app: AppHandle<Wry>, prompt: String) -> Result<String, String> {
    let prompt = prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("empty prompt".into());
    }
    let id = uuid_like();
    crate::proactive::bump_last_interaction();
    crate::chat::spawn_generation(app, id.clone(), prompt);
    Ok(id)
}

#[tauri::command]
pub async fn cancel_generation(service: State<'_, Arc<ChatService>>) -> Result<(), String> {
    service.cancel();
    Ok(())
}

#[tauri::command]
pub async fn reset_chat(service: State<'_, Arc<ChatService>>) -> Result<(), String> {
    service.clear().await;
    Ok(())
}

#[tauri::command]
pub fn list_assets(app: AppHandle<Wry>) -> Vec<serde_json::Value> {
    let statuses = models::statuses(&app);
    models::catalog()
        .into_iter()
        .map(|a| {
            let st = statuses.iter().find(|s| s.id == a.id);
            serde_json::json!({
                "id": a.id,
                "kind": a.kind,
                "title": a.title,
                "description": a.description,
                "file_name": a.file_name,
                "approx_size_mb": a.approx_size_mb,
                "installed": st.map(|s| s.installed).unwrap_or(false),
                "path": st.and_then(|s| s.path.clone()),
            })
        })
        .collect()
}

#[tauri::command]
pub fn download_asset(app: AppHandle<Wry>, asset_id: String) -> Result<(), String> {
    let asset = models::find(&asset_id).ok_or_else(|| format!("unknown asset: {asset_id}"))?;
    models::spawn_download(app, asset);
    Ok(())
}

/// Deletes a downloaded asset from disk and clears it from the corresponding
/// active-model setting if that setting currently points at the deleted file.
/// Missing files are treated as success (idempotent).
#[tauri::command]
pub async fn delete_asset(app: AppHandle<Wry>, asset_id: String) -> Result<(), String> {
    let asset = models::find(&asset_id).ok_or_else(|| format!("unknown asset: {asset_id}"))?;
    let path = models::asset_path(&app, &asset)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    let path_str = path.to_string_lossy().to_string();
    // Clear whichever active-setting pointed at this file so the UI stops
    // pretending the model is active.
    use crate::models::AssetKind;
    match asset.kind {
        AssetKind::LlmGguf => {
            if settings::get_local_model_path(&app).as_deref() == Some(path_str.as_str()) {
                settings::set_local_model_path(&app, "").map_err(|e| e.to_string())?;
            }
        }
        AssetKind::PiperVoice => {
            if settings::get_piper_voice(&app).as_deref() == Some(path_str.as_str()) {
                settings::set_piper_voice(&app, "").map_err(|e| e.to_string())?;
                reload_tts(&app).await;
            }
        }
        AssetKind::WhisperGgml => {
            if settings::get_whisper_model_path(&app).as_deref() == Some(path_str.as_str()) {
                settings::set_whisper_model_path(&app, "").map_err(|e| e.to_string())?;
            }
        }
        AssetKind::PiperConfig => { /* no active-setting; config auto-pairs with voice */ }
    }
    Ok(())
}

#[tauri::command]
pub fn set_local_model(app: AppHandle<Wry>, asset_id: String) -> Result<(), String> {
    let asset = models::find(&asset_id).ok_or_else(|| format!("unknown asset: {asset_id}"))?;
    let path = models::asset_path(&app, &asset)?;
    if !path.exists() {
        return Err("asset is not downloaded yet".into());
    }
    settings::set_local_model_path(&app, path.to_string_lossy().as_ref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_piper_binary(app: AppHandle<Wry>, path: String) -> Result<(), String> {
    settings::set_piper_binary(&app, &path).map_err(|e| e.to_string())?;
    reload_tts(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn set_piper_voice(app: AppHandle<Wry>, path: String) -> Result<(), String> {
    settings::set_piper_voice(&app, &path).map_err(|e| e.to_string())?;
    reload_tts(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn set_tts_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_tts_enabled(&app, enabled).map_err(|e| e.to_string())?;
    reload_tts(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn set_tts_provider(app: AppHandle<Wry>, provider: String) -> Result<(), String> {
    settings::set_tts_provider(&app, &provider).map_err(|e| e.to_string())?;
    reload_tts(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn set_tts_prosody(
    app: AppHandle<Wry>,
    length_scale: Option<f64>,
    noise_scale: Option<f64>,
    noise_w: Option<f64>,
) -> Result<(), String> {
    settings::set_tts_length_scale(&app, length_scale).map_err(|e| e.to_string())?;
    settings::set_tts_noise_scale(&app, noise_scale).map_err(|e| e.to_string())?;
    settings::set_tts_noise_w(&app, noise_w).map_err(|e| e.to_string())?;
    reload_tts(&app).await;
    Ok(())
}

#[tauri::command]
pub fn set_tts_volume(app: AppHandle<Wry>, volume: f64) -> Result<(), String> {
    settings::set_tts_volume(&app, volume).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_sovits_config(
    app: AppHandle<Wry>,
    endpoint: String,
    ref_audio: String,
    prompt_text: String,
    prompt_lang: String,
    text_lang: String,
    speed: f64,
) -> Result<(), String> {
    settings::set_sovits_endpoint(&app, &endpoint).map_err(|e| e.to_string())?;
    settings::set_sovits_ref_audio(&app, &ref_audio).map_err(|e| e.to_string())?;
    settings::set_sovits_prompt_text(&app, &prompt_text).map_err(|e| e.to_string())?;
    settings::set_sovits_prompt_lang(&app, &prompt_lang).map_err(|e| e.to_string())?;
    settings::set_sovits_text_lang(&app, &text_lang).map_err(|e| e.to_string())?;
    settings::set_sovits_speed(&app, speed).map_err(|e| e.to_string())?;
    reload_tts(&app).await;
    Ok(())
}

#[tauri::command]
pub fn set_proactive_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_proactive_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_desktop_automation_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_desktop_automation_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_auto_screen_watch_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_auto_screen_watch_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_chat_tool_calls_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_chat_tool_calls_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_avatar_zoom(app: AppHandle<Wry>, value: f64) -> Result<(), String> {
    settings::set_avatar_zoom(&app, value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_avatar_offset(app: AppHandle<Wry>, offset_x: f64, offset_y: f64) -> Result<(), String> {
    settings::set_avatar_offset_x(&app, offset_x).map_err(|e| e.to_string())?;
    settings::set_avatar_offset_y(&app, offset_y).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_game_coach_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_game_coach_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_game_coach_model(app: AppHandle<Wry>, model: String) -> Result<(), String> {
    settings::set_game_coach_model(&app, &model).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_live2d_model(app: AppHandle<Wry>, url: String) -> Result<(), String> {
    settings::set_live2d_model_url(&app, &url).map_err(|e| e.to_string())
}

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
pub fn set_smart_routing(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_smart_routing(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_classifier_model(app: AppHandle<Wry>, model: String) -> Result<(), String> {
    settings::set_classifier_model(&app, &model).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_rag_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_rag_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_openrouter_model(app: AppHandle<Wry>, model: String) -> Result<(), String> {
    settings::set_openrouter_model(&app, &model).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_openrouter_tts_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_openrouter_tts_enabled(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_openrouter_tts_model(app: AppHandle<Wry>, model: String) -> Result<(), String> {
    settings::set_openrouter_tts_model(&app, &model).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_openrouter_tts_voice(app: AppHandle<Wry>, voice: String) -> Result<(), String> {
    settings::set_openrouter_tts_voice(&app, &voice).map_err(|e| e.to_string())
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

/// None = auto (CPU, or GPU if the GGML backend has a GPU runtime);
/// Some(0) = force CPU; Some(n>0) = offload n layers to the GPU.
#[tauri::command]
pub fn set_llm_gpu_layers(app: AppHandle<Wry>, layers: Option<i64>) -> Result<(), String> {
    settings::set_gpu_layers(&app, layers).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_auto_listen(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_auto_listen(&app, enabled).map_err(|e| e.to_string())
}

/// Returns cached machine info so the settings page can show detected GPUs
/// and let the user know whether local-LLM GPU offload is feasible.
#[tauri::command]
pub fn system_info() -> serde_json::Value {
    let snap = crate::sysctx::snapshot();
    serde_json::json!({
        "os": snap.os_long,
        "cpu": snap.cpu_brand,
        "cpu_cores": snap.cpu_cores,
        "ram_gb": snap.total_memory_gb,
        "gpus": snap.gpus,
        "has_nvidia": crate::sysctx::has_nvidia_gpu(),
        "hostname": snap.hostname,
    })
}

/// Fetches the OpenRouter model catalog using the configured API key so
/// the settings page can offer a search/autocomplete picker. Returns a
/// pruned list — only id + name + context_length + pricing — to keep the
/// payload small.
#[tauri::command]
pub async fn list_openrouter_models(app: AppHandle<Wry>) -> Result<serde_json::Value, String> {
    let key = settings::get_openrouter_key(&app)
        .ok_or_else(|| "OpenRouter API key is not set.".to_string())?;
    let client = reqwest::Client::builder()
        .user_agent(concat!("komorebi/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get("https://openrouter.ai/api/v1/models")
        .bearer_auth(&key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("openrouter: {}", resp.status()));
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let list = body
        .get("data")
        .and_then(|d| d.as_array())
        .cloned()
        .unwrap_or_default();
    let pruned: Vec<_> = list
        .into_iter()
        .map(|m| {
            serde_json::json!({
                "id": m.get("id"),
                "name": m.get("name"),
                "context_length": m.get("context_length"),
                "pricing": m.get("pricing"),
                "architecture": m.get("architecture"),
            })
        })
        .collect();
    Ok(serde_json::Value::Array(pruned))
}

#[tauri::command]
pub fn rag_list_folders(
    rag: State<'_, Arc<komorebi_storage::RagIndex>>,
) -> Result<Vec<komorebi_storage::FolderStats>, String> {
    rag.folders().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rag_add_folder(
    rag: State<'_, Arc<komorebi_storage::RagIndex>>,
    path: String,
) -> Result<(), String> {
    rag.add_folder(std::path::Path::new(&path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rag_remove_folder(
    rag: State<'_, Arc<komorebi_storage::RagIndex>>,
    path: String,
) -> Result<(), String> {
    rag.remove_folder(std::path::Path::new(&path))
        .map_err(|e| e.to_string())
}

/// Re-walks either a single folder (if `path` is given) or every known
/// folder. Runs on a blocking thread so the UI stays responsive.
#[tauri::command]
pub async fn rag_reindex(
    app: AppHandle<Wry>,
    path: Option<String>,
) -> Result<komorebi_storage::IndexReport, String> {
    let rag: Arc<komorebi_storage::RagIndex> = app
        .try_state::<Arc<komorebi_storage::RagIndex>>()
        .ok_or_else(|| "RAG index not initialized".to_string())?
        .inner()
        .clone();
    tokio::task::spawn_blocking(move || {
        if let Some(p) = path {
            rag.index_folder(std::path::Path::new(&p))
        } else {
            rag.index_all()
        }
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn speak_text(app: AppHandle<Wry>, text: String) -> Result<(), String> {
    if text.trim().is_empty() {
        return Ok(());
    }
    match synthesize_via_provider(&app, &text).await {
        Ok(Some(wav)) => {
            emit_tts_wav(&app, &wav);
            Ok(())
        }
        Ok(None) => Err("no TTS provider configured".into()),
        Err(e) => Err(e),
    }
}

/// Route a text snippet through the currently selected TTS provider and
/// return the synthesized WAV bytes. Returns Ok(None) when no provider is
/// configured (TTS disabled or mis-configured) — callers should silently
/// skip playback in that case.
pub async fn synthesize_via_provider(
    app: &AppHandle<Wry>,
    text: &str,
) -> Result<Option<Vec<u8>>, String> {
    let provider = settings::get_tts_provider(app);
    match provider.as_str() {
        "openrouter" => {
            if !settings::get_openrouter_tts_enabled(app) {
                return Ok(None);
            }
            let Some(key) = settings::get_openrouter_key(app) else {
                return Ok(None);
            };
            let cfg = komorebi_voice::openrouter::OpenRouterTtsConfig {
                api_key: key,
                model: settings::get_openrouter_tts_model(app),
                voice: settings::get_openrouter_tts_voice(app),
            };
            let tts = komorebi_voice::openrouter::OpenRouterTts::new();
            tts.configure(Some(cfg)).await;
            tts.synthesize(text)
                .await
                .map(Some)
                .map_err(|e| e.to_string())
        }
        "sovits" => {
            let Some(sovits) = app.try_state::<komorebi_voice::sovits::SoVitsTts>() else {
                return Ok(None);
            };
            if !sovits.is_configured().await {
                return Ok(None);
            }
            sovits
                .synthesize(text)
                .await
                .map(Some)
                .map_err(|e| e.to_string())
        }
        _ => {
            let Some(tts) = app.try_state::<komorebi_voice::tts::PiperTts>() else {
                return Ok(None);
            };
            if !tts.is_configured().await {
                return Ok(None);
            }
            tts.synthesize(text)
                .await
                .map(Some)
                .map_err(|e| e.to_string())
        }
    }
}

/// LLM-driven, multilingual reaction line played when the user taps the
/// avatar. `zone` is one of `head`, `body`, `hand` (legacy `head`/`body`
/// callers still work). Generation route follows the global Mode setting
/// (Local / Cloud / Auto) and falls back to canned localized strings on
/// timeout or error so the user always hears something.
#[tauri::command]
pub async fn speak_reaction(app: AppHandle<Wry>, zone: String) -> Result<(), String> {
    let text = crate::react::generate(&app, &zone).await;
    if text.is_empty() {
        return Ok(());
    }
    if let Ok(Some(wav)) = synthesize_via_provider(&app, &text).await {
        emit_tts_wav(&app, &wav);
    }
    Ok(())
}

/// Generic event-driven reaction (drag, idle, custom). Same pipeline as
/// [`speak_reaction`] — exposed separately so frontend code reads more
/// naturally at call sites that aren't avatar taps.
#[tauri::command]
pub async fn react_event(app: AppHandle<Wry>, kind: String) -> Result<(), String> {
    let text = crate::react::generate(&app, &kind).await;
    if text.is_empty() {
        return Ok(());
    }
    if let Ok(Some(wav)) = synthesize_via_provider(&app, &text).await {
        emit_tts_wav(&app, &wav);
    }
    Ok(())
}

/// Emit synthesized WAV audio to the frontend.
/// Writes the WAV to a temp file and emits the file path. The frontend
/// reads the bytes via `read_tts_bytes` → Blob → object URL, which goes
/// through the native media pipeline (no base64 data URL, no asset: proto).
pub fn emit_tts_wav(app: &AppHandle<Wry>, wav: &[u8]) {
    let dir = std::env::temp_dir().join("komorebi-tts");
    if let Err(e) = std::fs::create_dir_all(&dir) {
        tracing::warn!(?e, "failed to create tts temp dir");
        return;
    }
    // Best-effort cleanup of older files (keep dir small).
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    let fname = format!(
        "tts-{}.wav",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let path = dir.join(fname);
    if let Err(e) = std::fs::write(&path, wav) {
        tracing::warn!(?e, "failed to write tts wav");
        return;
    }
    let path_str = path.to_string_lossy().to_string();
    if let Err(e) = app.emit("tts:play", path_str) {
        tracing::warn!(?e, "failed to emit tts:play");
    }
}

/// Read raw bytes from a TTS temp file (used by the frontend to construct
/// a Blob/object-URL for `<audio>` playback).
#[tauri::command]
pub async fn read_tts_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    // Only allow reading from our own temp dir.
    let expected_root = std::env::temp_dir().join("komorebi-tts");
    let p = std::path::PathBuf::from(&path);
    if !p.starts_with(&expected_root) {
        return Err("path outside tts temp dir".into());
    }
    let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Resolves the bundled Piper binary shipped as a Tauri resource.
/// Returns `None` if the resource dir does not contain our sidecar — this is
/// expected during `cargo test` or when the dev build skipped `fetch-piper`.
fn bundled_piper(app: &AppHandle<Wry>) -> Option<std::path::PathBuf> {
    let name = if cfg!(windows) { "piper.exe" } else { "piper" };
    let path = app
        .path()
        .resolve(
            format!("binaries/piper/{name}"),
            tauri::path::BaseDirectory::Resource,
        )
        .ok()?;
    path.exists().then_some(path)
}

/// Re-reads persisted TTS settings and applies them to the shared handle.
/// Called on startup and whenever any TTS-related setting changes.
pub async fn reload_tts(app: &AppHandle<Wry>) {
    use komorebi_voice::tts::{PiperConfig, PiperTts};
    let Some(tts) = app.try_state::<PiperTts>() else {
        return;
    };
    let enabled = settings::get_tts_enabled(app);
    let bin_setting = settings::get_piper_binary(app);
    let voice = settings::get_piper_voice(app);

    // Resolution order for the Piper binary:
    //   1. User-provided override (non-empty `piper_binary_path`).
    //   2. Bundled sidecar (`binaries/piper/piper[.exe]`).
    let bin = bin_setting
        .filter(|s| !s.is_empty())
        .map(std::path::PathBuf::from)
        .or_else(|| bundled_piper(app));

    let length = settings::get_tts_length_scale(app).map(|v| v as f32);
    let noise = settings::get_tts_noise_scale(app).map(|v| v as f32);
    let noise_w = settings::get_tts_noise_w(app).map(|v| v as f32);

    let cfg = match (enabled, bin, voice) {
        (true, Some(b), Some(v)) if !v.is_empty() => {
            Some(PiperConfig::from_voice(b, v).with_prosody(length, noise, noise_w))
        }
        _ => None,
    };
    tts.inner().configure(cfg).await;

    // SoVITS provider — independent of the Piper path. Only enabled when
    // TTS is on and an endpoint URL is configured; the provider selector
    // (`tts_provider`) decides which one is actually used at synth time.
    if let Some(sovits) = app.try_state::<komorebi_voice::sovits::SoVitsTts>() {
        let sv_cfg = if enabled {
            settings::get_sovits_config(app)
        } else {
            None
        };
        sovits.inner().configure(sv_cfg).await;
    }
}

// --- Vision (screen / region / attached image) ---------------------------

/// Capture the primary monitor and ask the vision model about it. Streams
/// the answer back via the normal `chat:*` event channel so the bubble,
/// emotion tags, and TTS pipeline all work without changes.
#[tauri::command]
pub async fn vision_capture_full(app: AppHandle<Wry>, prompt: String) -> Result<String, String> {
    let monitor = 0usize;
    let bytes =
        tokio::task::spawn_blocking(move || komorebi_desktop::capture::capture_screen(monitor))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
    let id = uuid_like();
    crate::proactive::bump_last_interaction();
    crate::chat::spawn_vision_generation(app, id.clone(), prompt, bytes);
    Ok(id)
}

#[derive(serde::Deserialize)]
pub struct VisionRegionArgs {
    pub prompt: String,
    pub monitor: Option<usize>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub async fn vision_capture_region(
    app: AppHandle<Wry>,
    args: VisionRegionArgs,
) -> Result<String, String> {
    let monitor = args.monitor.unwrap_or(0);
    let (x, y, w, h) = (args.x, args.y, args.width, args.height);
    let bytes = tokio::task::spawn_blocking(move || {
        komorebi_desktop::capture::capture_region(monitor, x, y, w, h)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    let id = uuid_like();
    crate::proactive::bump_last_interaction();
    crate::chat::spawn_vision_generation(app, id.clone(), args.prompt, bytes);
    Ok(id)
}

/// Opens (or focuses) a dedicated fullscreen overlay window used to pick
/// a screen region. The picker then emits `vision:region-selected` back to
/// the main window with both selected coordinates and user prompt.
/// Saves the main window's current geometry, then resizes/moves it to
/// cover the primary monitor so the React UI can render the region picker
/// over the full screen. The frontend listens for `vision:region-open`.
#[tauri::command]
pub fn enter_region_picker_mode(app: AppHandle<Wry>, prompt: String) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize};

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    // Snapshot current window geometry so exit can restore it.
    let prev_pos = main
        .outer_position()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(main.scale_factor().map_err(|e| e.to_string())?);
    let prev_size = main
        .outer_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(main.scale_factor().map_err(|e| e.to_string())?);

    if let Some(state) = app.try_state::<RegionPickerState>() {
        let mut g = state.lock().unwrap();
        *g = Some(SavedGeometry {
            x: prev_pos.x,
            y: prev_pos.y,
            w: prev_size.width,
            h: prev_size.height,
        });
    }

    if let Ok(Some(monitor)) = main.primary_monitor() {
        let scale = monitor.scale_factor();
        let size = monitor.size().to_logical::<f64>(scale);
        let pos = monitor.position().to_logical::<f64>(scale);
        let _ = main.set_position(LogicalPosition::new(pos.x, pos.y));
        let _ = main.set_size(LogicalSize::new(size.width, size.height));
    }

    let _ = main.set_always_on_top(true);
    let _ = main.show();
    let _ = main.set_focus();

    main.emit("vision:region-open", prompt)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Restores the main window geometry saved by `enter_region_picker_mode`.
#[tauri::command]
pub fn exit_region_picker_mode(app: AppHandle<Wry>) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize};
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let saved = app
        .try_state::<RegionPickerState>()
        .and_then(|s| s.lock().unwrap().take());
    if let Some(g) = saved {
        let _ = main.set_size(LogicalSize::new(g.w, g.h));
        let _ = main.set_position(LogicalPosition::new(g.x, g.y));
    }
    Ok(())
}

#[derive(Clone, Copy)]
pub struct SavedGeometry {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

pub type RegionPickerState = std::sync::Mutex<Option<SavedGeometry>>;

/// Send an arbitrary user-supplied image (already PNG-encoded) along with
/// a question. Frontend uploads via base64 to keep IPC payloads simple.
#[tauri::command]
pub async fn vision_with_image(
    app: AppHandle<Wry>,
    prompt: String,
    png_base64: String,
) -> Result<String, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.as_bytes())
        .map_err(|e| format!("invalid base64 image: {e}"))?;
    if bytes.is_empty() {
        return Err("empty image".into());
    }
    let id = uuid_like();
    crate::proactive::bump_last_interaction();
    crate::chat::spawn_vision_generation(app, id.clone(), prompt, bytes);
    Ok(id)
}

/// Lightweight id generator (avoids pulling in the `uuid` crate just for UX).
fn uuid_like() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("msg-{nanos:x}")
}

// --- Image generation commands -------------------------------------------

#[tauri::command]
pub fn generate_image(
    app: AppHandle<Wry>,
    prompt: String,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<String, String> {
    let prompt = prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("empty image prompt".into());
    }
    let id = uuid_like();
    crate::proactive::bump_last_interaction();
    crate::imagegen::spawn_generation(app, id.clone(), prompt, width, height);
    Ok(id)
}

#[tauri::command]
pub fn cancel_image_generation(app: AppHandle<Wry>) -> Result<(), String> {
    crate::imagegen::cancel(&app);
    Ok(())
}

#[tauri::command]
pub fn save_generated_image(png_base64: String, target_path: String) -> Result<(), String> {
    crate::imagegen::save_image_to_path(&png_base64, &target_path)
}

#[tauri::command]
pub fn set_imagegen_provider(app: AppHandle<Wry>, provider: String) -> Result<(), String> {
    let v = match provider.as_str() {
        "openrouter" | "replicate" | "local" => provider,
        other => return Err(format!("unknown imagegen provider: {other}")),
    };
    settings::set_imagegen_provider(&app, &v).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_imagegen_openrouter_model(app: AppHandle<Wry>, model: String) -> Result<(), String> {
    settings::set_imagegen_openrouter_model(&app, &model).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_imagegen_replicate_model(app: AppHandle<Wry>, model: String) -> Result<(), String> {
    settings::set_imagegen_replicate_model(&app, &model).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_imagegen_local_binary(app: AppHandle<Wry>, path: String) -> Result<(), String> {
    settings::set_imagegen_local_binary(&app, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_imagegen_local_model(app: AppHandle<Wry>, path: String) -> Result<(), String> {
    settings::set_imagegen_local_model(&app, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_imagegen_device(app: AppHandle<Wry>, device: String) -> Result<(), String> {
    let v = match device.as_str() {
        "auto" | "cpu" | "cuda" => device,
        other => return Err(format!("unknown device: {other}")),
    };
    settings::set_imagegen_device(&app, &v).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_imagegen_size(app: AppHandle<Wry>, width: i64, height: i64) -> Result<(), String> {
    settings::set_imagegen_size(&app, width, height).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_imagegen_steps(app: AppHandle<Wry>, steps: i64) -> Result<(), String> {
    settings::set_imagegen_steps(&app, steps).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_imagegen_negative_prompt(app: AppHandle<Wry>, prompt: String) -> Result<(), String> {
    settings::set_imagegen_negative_prompt(&app, &prompt).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_replicate_token(app: AppHandle<Wry>, key: String) -> Result<(), String> {
    settings::set_replicate_token(&app, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_replicate_token(app: AppHandle<Wry>) -> Result<(), String> {
    settings::set_replicate_token(&app, "").map_err(|e| e.to_string())
}

// --- Weather --------------------------------------------------------------

#[tauri::command]
pub async fn get_weather(
    app: AppHandle<Wry>,
    city: Option<String>,
) -> Result<komorebi_weather::WeatherReport, String> {
    let report = crate::weather::fetch(&app, city).await?;
    let _ = app.emit("weather:result", &report);
    Ok(report)
}

#[tauri::command]
pub fn set_weather_provider(app: AppHandle<Wry>, provider: String) -> Result<(), String> {
    settings::set_weather_provider(&app, &provider).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_weather_api_key(app: AppHandle<Wry>, key: String) -> Result<(), String> {
    settings::set_weather_api_key(&app, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_weather_api_key(app: AppHandle<Wry>) -> Result<(), String> {
    settings::set_weather_api_key(&app, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_weather_default_city(app: AppHandle<Wry>, city: String) -> Result<(), String> {
    settings::set_weather_default_city(&app, &city).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_weather_use_ip(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_weather_use_ip(&app, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_weather_units(app: AppHandle<Wry>, units: String) -> Result<(), String> {
    settings::set_weather_units(&app, &units).map_err(|e| e.to_string())
}

// --- Relationship ---------------------------------------------------------

#[tauri::command]
pub fn get_relationship_state(app: AppHandle<Wry>) -> crate::relationship::State {
    crate::relationship::load(&app)
}

#[tauri::command]
pub fn reset_relationship(app: AppHandle<Wry>) -> Result<(), String> {
    crate::relationship::reset(&app);
    Ok(())
}

#[tauri::command]
pub fn set_user_name(app: AppHandle<Wry>, name: String) -> Result<(), String> {
    settings::set_user_name(&app, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_relationship_visibility(app: AppHandle<Wry>, visibility: String) -> Result<(), String> {
    settings::set_relationship_visibility(&app, &visibility).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_relationship_nsfw_allowed(app: AppHandle<Wry>, allowed: bool) -> Result<(), String> {
    settings::set_relationship_nsfw_allowed(&app, allowed).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_relationship_decay_enabled(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    settings::set_relationship_decay_enabled(&app, enabled).map_err(|e| e.to_string())
}
