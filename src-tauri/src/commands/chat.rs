//! Chat lifecycle commands.

use super::util::uuid_like;
use crate::chat::ChatService;
use std::sync::Arc;
use tauri::{AppHandle, State, Wry};

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
