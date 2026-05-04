//! Image-generation commands and provider settings.

use super::util::uuid_like;
use crate::settings;
use tauri::{AppHandle, Wry};

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
