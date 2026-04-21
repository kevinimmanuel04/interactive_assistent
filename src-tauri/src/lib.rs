//! Komorebi desktop entrypoint.

mod chat;
mod commands;
mod models;
mod settings;

use std::sync::Arc;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,komorebi=debug".into()),
        )
        .init();

    let toggle_input = Shortcut::new(Some(Modifiers::ALT), Code::Space);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &toggle_input && event.state() == ShortcutState::Pressed {
                        if let Err(e) = app.emit("hotkey:toggle-input", ()) {
                            tracing::warn!(?e, "failed to emit toggle-input");
                        }
                    }
                })
                .build(),
        )
        .manage(Arc::new(chat::ChatService::new()))
        .manage(komorebi_voice::tts::PiperTts::new())
        .manage(komorebi_voice::stt::Recorder::new())
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::set_openrouter_key,
            commands::set_mode,
            commands::send_message,
            commands::cancel_generation,
            commands::reset_chat,
            commands::list_assets,
            commands::download_asset,
            commands::set_local_model,
            commands::set_piper_binary,
            commands::set_piper_voice,
            commands::set_tts_enabled,
            commands::set_live2d_model,
            commands::speak_text,
            commands::set_whisper_model,
            commands::start_recording,
            commands::stop_recording,
            commands::cancel_recording,
            commands::set_wake_word,
            commands::set_listen_enabled,
        ])
        .setup(move |app| {
            app.global_shortcut().register(toggle_input)?;
            // Apply persisted TTS config to the shared handle.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                crate::commands::reload_tts(&handle).await;
            });
            tracing::info!("Komorebi started");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
