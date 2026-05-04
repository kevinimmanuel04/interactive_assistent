//! System tray icon, menu, and the helper that toggles the main window.
//!
//! The Komorebi window is borderless / decorationless, so users have no
//! native way to quit. The tray gives them an obvious "Quit Komorebi"
//! action plus a left-click toggle to show/hide the avatar.

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

/// Build and install the tray icon. Logs (but does not propagate) any
/// failure so tray issues never block app startup.
pub(crate) fn install(app: &tauri::App) -> tauri::Result<()> {
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
    Ok(())
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
