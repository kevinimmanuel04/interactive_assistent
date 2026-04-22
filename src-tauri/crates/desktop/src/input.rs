//! Mouse + keyboard simulation via `enigo`.

use crate::DesktopError;
use enigo::{Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings};

fn new_enigo() -> Result<Enigo, DesktopError> {
    Enigo::new(&Settings::default()).map_err(|e| DesktopError::Input(e.to_string()))
}

pub fn move_cursor(x: i32, y: i32) -> Result<(), DesktopError> {
    let mut eng = new_enigo()?;
    eng.move_mouse(x, y, Coordinate::Abs)
        .map_err(|e| DesktopError::Input(e.to_string()))
}

#[derive(Debug, Clone, Copy)]
pub enum MouseBtn {
    Left,
    Right,
    Middle,
}

pub fn click(
    x: Option<i32>,
    y: Option<i32>,
    btn: MouseBtn,
    double: bool,
) -> Result<(), DesktopError> {
    let mut eng = new_enigo()?;
    if let (Some(x), Some(y)) = (x, y) {
        eng.move_mouse(x, y, Coordinate::Abs)
            .map_err(|e| DesktopError::Input(e.to_string()))?;
    }
    let b = match btn {
        MouseBtn::Left => Button::Left,
        MouseBtn::Right => Button::Right,
        MouseBtn::Middle => Button::Middle,
    };
    eng.button(b, Direction::Click)
        .map_err(|e| DesktopError::Input(e.to_string()))?;
    if double {
        eng.button(b, Direction::Click)
            .map_err(|e| DesktopError::Input(e.to_string()))?;
    }
    Ok(())
}

pub fn scroll(delta: i32, horizontal: bool) -> Result<(), DesktopError> {
    let mut eng = new_enigo()?;
    let axis = if horizontal {
        enigo::Axis::Horizontal
    } else {
        enigo::Axis::Vertical
    };
    eng.scroll(delta, axis)
        .map_err(|e| DesktopError::Input(e.to_string()))
}

pub fn type_text(text: &str) -> Result<(), DesktopError> {
    let mut eng = new_enigo()?;
    eng.text(text)
        .map_err(|e| DesktopError::Input(e.to_string()))
}

/// Press a named key (examples: `Enter`, `Tab`, `Escape`, `Space`, `Backspace`,
/// `ArrowUp` / `Up`, `ArrowLeft`). Case-insensitive. Unknown keys return an error.
pub fn press_key(name: &str) -> Result<(), DesktopError> {
    let key = resolve_key(name)?;
    let mut eng = new_enigo()?;
    eng.key(key, Direction::Click)
        .map_err(|e| DesktopError::Input(e.to_string()))
}

/// Press a key combination like `Ctrl+C`, `Alt+Tab`, `Ctrl+Shift+P`.
pub fn press_chord(chord: &str) -> Result<(), DesktopError> {
    let parts: Vec<&str> = chord.split('+').map(|s| s.trim()).collect();
    if parts.is_empty() {
        return Err(DesktopError::Input("empty chord".into()));
    }
    let (last, mods) = parts.split_last().unwrap();
    let final_key = resolve_key(last)?;
    let mut resolved_mods = Vec::with_capacity(mods.len());
    for m in mods {
        resolved_mods.push(resolve_key(m)?);
    }
    let mut eng = new_enigo()?;
    for m in &resolved_mods {
        eng.key(*m, Direction::Press)
            .map_err(|e| DesktopError::Input(e.to_string()))?;
    }
    let res = eng.key(final_key, Direction::Click);
    // Always release modifiers even if the main key failed.
    for m in resolved_mods.iter().rev() {
        let _ = eng.key(*m, Direction::Release);
    }
    res.map_err(|e| DesktopError::Input(e.to_string()))
}

fn resolve_key(raw: &str) -> Result<Key, DesktopError> {
    let s = raw.trim().to_ascii_lowercase();
    let k = match s.as_str() {
        "ctrl" | "control" => Key::Control,
        "shift" => Key::Shift,
        "alt" | "option" => Key::Alt,
        "meta" | "cmd" | "super" | "win" => Key::Meta,
        "enter" | "return" => Key::Return,
        "tab" => Key::Tab,
        "escape" | "esc" => Key::Escape,
        "space" | " " => Key::Space,
        "backspace" => Key::Backspace,
        "delete" | "del" => Key::Delete,
        "home" => Key::Home,
        "end" => Key::End,
        "pageup" => Key::PageUp,
        "pagedown" => Key::PageDown,
        "up" | "arrowup" => Key::UpArrow,
        "down" | "arrowdown" => Key::DownArrow,
        "left" | "arrowleft" => Key::LeftArrow,
        "right" | "arrowright" => Key::RightArrow,
        "f1" => Key::F1,
        "f2" => Key::F2,
        "f3" => Key::F3,
        "f4" => Key::F4,
        "f5" => Key::F5,
        "f6" => Key::F6,
        "f7" => Key::F7,
        "f8" => Key::F8,
        "f9" => Key::F9,
        "f10" => Key::F10,
        "f11" => Key::F11,
        "f12" => Key::F12,
        other => {
            // Single character → Unicode key.
            let mut chars = other.chars();
            match (chars.next(), chars.next()) {
                (Some(c), None) => Key::Unicode(c),
                _ => {
                    return Err(DesktopError::Input(format!("unknown key: {raw}")));
                }
            }
        }
    };
    Ok(k)
}
