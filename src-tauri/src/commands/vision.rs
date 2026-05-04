//! Vision capture commands and region-picker overlay state.

use super::util::uuid_like;
use tauri::{AppHandle, Emitter, Manager, Wry};

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
