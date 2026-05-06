//! Screen capture via `xcap` 0.9+ which on Windows uses the Windows
//! Graphics Capture API (WGC). Unlike older BitBlt-based capture, WGC
//! correctly samples DWM-composited / DirectComposition / hardware-
//! accelerated content (Discord, Telegram, Chrome, OBS, games, etc.) —
//! previously these surfaces came out as solid black frames.

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

fn cap_err(e: impl std::fmt::Display) -> DesktopError {
    DesktopError::Capture(e.to_string())
}

pub fn list_screens() -> Result<Vec<ScreenInfo>, DesktopError> {
    let monitors = xcap::Monitor::all().map_err(cap_err)?;
    let mut out = Vec::with_capacity(monitors.len());
    for (i, m) in monitors.into_iter().enumerate() {
        out.push(ScreenInfo {
            id: i as u32,
            name: m
                .friendly_name()
                .or_else(|_| m.name())
                .unwrap_or_else(|_| format!("Monitor {i}")),
            x: m.x().map_err(cap_err)?,
            y: m.y().map_err(cap_err)?,
            width: m.width().map_err(cap_err)?,
            height: m.height().map_err(cap_err)?,
            is_primary: m.is_primary().unwrap_or(false),
            scale_factor: m.scale_factor().unwrap_or(1.0),
        });
    }
    Ok(out)
}

/// Capture a full-screen screenshot of monitor `index` (primary if 0 and
/// none marked primary). Returns PNG-encoded bytes.
pub fn capture_screen(index: usize) -> Result<Vec<u8>, DesktopError> {
    let monitors = xcap::Monitor::all().map_err(cap_err)?;
    if monitors.is_empty() {
        return Err(DesktopError::Capture("no monitors detected".into()));
    }
    let chosen = if index == 0 {
        monitors
            .iter()
            .find(|m| m.is_primary().unwrap_or(false))
            .unwrap_or(&monitors[0])
    } else {
        monitors.get(index).unwrap_or(&monitors[0])
    };
    let img = chosen.capture_image().map_err(cap_err)?;
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
    let monitors = xcap::Monitor::all().map_err(cap_err)?;
    let mon = monitors
        .get(monitor_index)
        .ok_or_else(|| DesktopError::Capture(format!("monitor {monitor_index} not found")))?;
    let mw = mon.width().map_err(cap_err)? as i32;
    let mh = mon.height().map_err(cap_err)? as i32;
    let x = x.max(0).min(mw.saturating_sub(1));
    let y = y.max(0).min(mh.saturating_sub(1));
    let w = (width as i32).min(mw - x).max(1) as u32;
    let h = (height as i32).min(mh - y).max(1) as u32;
    let img = mon
        .capture_region(x as u32, y as u32, w, h)
        .map_err(cap_err)?;
    encode_png(img)
}

fn encode_png(img: image::RgbaImage) -> Result<Vec<u8>, DesktopError> {
    let mut out = std::io::Cursor::new(Vec::with_capacity(
        (img.width() * img.height() * 4 / 3) as usize,
    ));
    img.write_to(&mut out, ImageFormat::Png).map_err(cap_err)?;
    Ok(out.into_inner())
}
