//! Komorebi desktop entrypoint.

mod chat;
mod coach;
mod commands;
mod desktop_cmds;
mod models;
mod proactive;
mod react;
mod settings;
mod sysctx;
mod tools;

use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
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
    let vision_region = Shortcut::new(Some(Modifiers::ALT), Code::KeyV);

    tauri::Builder::default()
        .on_window_event(|window, event| {
            // Intercept window close → hide to tray instead of quitting.
            // Users still have the tray menu "Quit Komorebi" for a real exit.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut == &toggle_input {
                        if let Err(e) = app.emit("hotkey:toggle-input", ()) {
                            tracing::warn!(?e, "failed to emit toggle-input");
                        }
                    } else if shortcut == &vision_region {
                        if let Err(e) = app.emit("hotkey:vision-region", ()) {
                            tracing::warn!(?e, "failed to emit vision-region");
                        }
                    }
                })
                .build(),
        )
        .manage(Arc::new(chat::ChatService::new()))
        .manage(komorebi_voice::tts::PiperTts::new())
        .manage(komorebi_voice::sovits::SoVitsTts::new())
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
            commands::delete_asset,
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
            commands::set_smart_routing,
            commands::set_classifier_model,
            commands::set_rag_enabled,
            commands::rag_list_folders,
            commands::rag_add_folder,
            commands::rag_remove_folder,
            commands::rag_reindex,
            commands::list_audio_devices,
            commands::set_audio_input,
            commands::set_audio_output,
            commands::set_llm_gpu_layers,
            commands::set_auto_listen,
            commands::system_info,
            commands::list_openrouter_models,
            commands::set_openrouter_model,
            commands::read_tts_bytes,
            commands::set_tts_provider,
            commands::set_tts_prosody,
            commands::set_tts_volume,
            commands::set_sovits_config,
            commands::speak_reaction,
            commands::react_event,
            commands::set_proactive_enabled,
            commands::set_desktop_automation_enabled,
            commands::set_openrouter_tts_enabled,
            commands::set_openrouter_tts_model,
            commands::set_openrouter_tts_voice,
            commands::set_openrouter_stt_enabled,
            commands::set_openrouter_stt_model,
            commands::set_game_coach_enabled,
            commands::set_game_coach_model,
            commands::set_faster_whisper_enabled,
            commands::set_faster_whisper_url,
            commands::set_faster_whisper_model,
            commands::set_faster_whisper_language,
            commands::validate_faster_whisper,
            commands::set_deepgram_key,
            commands::clear_deepgram_key,
            commands::validate_deepgram_key,
            commands::set_deepgram_enabled,
            commands::set_deepgram_model,
            commands::set_deepgram_language,
            desktop_cmds::desktop_workspace_root,
            desktop_cmds::desktop_set_workspace,
            desktop_cmds::desktop_list_screens,
            desktop_cmds::desktop_screenshot,
            desktop_cmds::desktop_screenshot_region,
            desktop_cmds::desktop_click,
            desktop_cmds::desktop_move_cursor,
            desktop_cmds::desktop_type,
            desktop_cmds::desktop_key,
            desktop_cmds::desktop_scroll,
            desktop_cmds::desktop_top_processes,
            desktop_cmds::desktop_active_window,
            desktop_cmds::desktop_context_snapshot,
            desktop_cmds::desktop_write_file,
            desktop_cmds::desktop_read_file,
            desktop_cmds::desktop_list_dir,
            desktop_cmds::desktop_vd_switch_left,
            desktop_cmds::desktop_vd_switch_right,
            desktop_cmds::desktop_vd_create,
            desktop_cmds::desktop_vd_close,
            desktop_cmds::desktop_vd_task_view,
            tools::run_tool,
            commands::vision_capture_full,
            commands::vision_capture_region,
            commands::vision_with_image,
            commands::set_auto_screen_watch_enabled,
            commands::set_chat_tool_calls_enabled,
            commands::set_avatar_zoom,
            commands::set_avatar_offset,
        ])
        .setup(move |app| {
            app.global_shortcut().register(toggle_input)?;
            if let Err(e) = app.global_shortcut().register(vision_region) {
                tracing::warn!(?e, "failed to register Alt+V hotkey");
            }

            // System tray: left-click toggles the window, menu offers a
            // clean exit. Essential because the window is decorationless —
            // without this, users have no obvious way to quit.
            let show_item = MenuItem::with_id(app, "show", "Show / Hide", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Komorebi", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let mut tray_builder = TrayIconBuilder::with_id("main")
                .tooltip("Komorebi")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => toggle_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_main_window(tray.app_handle());
                    }
                });
            // Window icon may be absent in dev builds; fall back gracefully.
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            if let Err(e) = tray_builder.build(app) {
                tracing::warn!(?e, "failed to build tray icon (continuing without tray)");
            }

            // Initialize the RAG index in the app's data dir and stash it
            // on the Tauri state map.
            match app.path().app_data_dir() {
                Ok(dir) => {
                    let db = dir.join("rag.db");
                    match komorebi_storage::RagIndex::open(&db) {
                        Ok(idx) => {
                            app.manage(Arc::new(idx));
                            tracing::info!(?db, "RAG index opened");
                        }
                        Err(e) => tracing::warn!(?e, "failed to open RAG index"),
                    }
                }
                Err(e) => tracing::warn!(?e, "app_data_dir unavailable; RAG disabled"),
            }
            // Apply persisted TTS config to the shared handle.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                crate::commands::reload_tts(&handle).await;
            });

            // Proactive agent — polls active window/processes and nudges
            // the user when appropriate (only if enabled in settings).
            crate::proactive::spawn(app.handle().clone());
            crate::coach::spawn(app.handle().clone());

            tracing::info!("Komorebi started");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Toggle the main window visibility. Used by tray click and menu.
pub(crate) fn toggle_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        match w.is_visible() {
            Ok(true) => {
                let _ = w.hide();
            }
            _ => {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
    }
}
