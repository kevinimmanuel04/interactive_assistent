//! Screen capture using `xcap` (works on Windows, macOS, Linux/X11+Wayland).

use crate::DesktopError;
use image::ImageFormat;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ScreenInfo {
    pub id: u32,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
    pub scale_factor: f32,
}

pub fn list_screens() -> Result<Vec<ScreenInfo>, DesktopError> {
    let monitors = xcap::Monitor::all().map_err(|e| DesktopError::Capture(e.to_string()))?;
    Ok(monitors
        .into_iter()
        .enumerate()
        .map(|(i, m)| ScreenInfo {
            id: i as u32,
            name: m.name().to_string(),
            x: m.x(),
            y: m.y(),
            width: m.width(),
            height: m.height(),
            is_primary: m.is_primary(),
            scale_factor: m.scale_factor(),
        })
        .collect())
}

/// Capture a full-screen screenshot of monitor `index` (primary if 0 and
/// none marked primary). Returns PNG-encoded bytes.
pub fn capture_screen(index: usize) -> Result<Vec<u8>, DesktopError> {
    let monitors = xcap::Monitor::all().map_err(|e| DesktopError::Capture(e.to_string()))?;
    if monitors.is_empty() {
        return Err(DesktopError::Capture("no monitors detected".into()));
    }
    let mon = monitors
        .iter()
        .find(|m| m.is_primary())
        .or_else(|| monitors.get(index))
        .unwrap_or(&monitors[0]);
    let img = mon
        .capture_image()
        .map_err(|e| DesktopError::Capture(e.to_string()))?;
    encode_png(img)
}

/// Capture a sub-rectangle of a monitor. Coordinates are in monitor-local
/// logical pixels. Clamped to monitor bounds.
pub fn capture_region(
    monitor_index: usize,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, DesktopError> {
    let monitors = xcap::Monitor::all().map_err(|e| DesktopError::Capture(e.to_string()))?;
    let mon = monitors
        .get(monitor_index)
        .ok_or_else(|| DesktopError::Capture(format!("monitor {monitor_index} not found")))?;
    let full = mon
        .capture_image()
        .map_err(|e| DesktopError::Capture(e.to_string()))?;
    let (mw, mh) = (full.width() as i32, full.height() as i32);
    let x = x.max(0).min(mw.saturating_sub(1));
    let y = y.max(0).min(mh.saturating_sub(1));
    let w = (width as i32).min(mw - x).max(1) as u32;
    let h = (height as i32).min(mh - y).max(1) as u32;
    let cropped = image::imageops::crop_imm(&full, x as u32, y as u32, w, h).to_image();
    encode_png(cropped)
}

fn encode_png(img: image::RgbaImage) -> Result<Vec<u8>, DesktopError> {
    let mut out = std::io::Cursor::new(Vec::with_capacity(
        (img.width() * img.height() * 4 / 3) as usize,
    ));
    img.write_to(&mut out, ImageFormat::Png)
        .map_err(|e| DesktopError::Capture(e.to_string()))?;
    Ok(out.into_inner())
}
