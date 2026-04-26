//! Windows virtual-desktop control.
//!
//! Implementation note: the official `IVirtualDesktopManager` COM interface
//! Microsoft ships publicly only exposes "is window on current desktop"
//! and "move window to desktop" — it doesn't let you switch, create, or
//! delete desktops. Doing that requires the *internal* (undocumented,
//! version-keyed) `IVirtualDesktopManagerInternal` COM object whose IID
//! changes between Windows builds, which is a maintenance nightmare.
//!
//! Instead we drive the well-known global hotkeys that the OS itself
//! handles regardless of build:
//!
//! | Action            | Hotkey            |
//! |-------------------|-------------------|
//! | Switch right      | Win + Ctrl + →    |
//! | Switch left       | Win + Ctrl + ←    |
//! | New desktop       | Win + Ctrl + D    |
//! | Close current     | Win + Ctrl + F4   |
//! | Task View overlay | Win + Tab         |
//!
//! Hotkeys are synthesized via the Win32 `keybd_event` API through a
//! small PowerShell P/Invoke trampoline (same approach used by the
//! `media` skill). No new dependencies; no unsafe COM.

use crate::DesktopError;

#[derive(Debug, Clone, Copy)]
pub enum VirtualDesktopAction {
    SwitchLeft,
    SwitchRight,
    Create,
    CloseCurrent,
    TaskView,
}

#[cfg(target_os = "windows")]
pub fn perform(action: VirtualDesktopAction) -> Result<(), DesktopError> {
    // VK codes:
    //   0x5B = LWIN, 0x11 = CTRL, 0x25 = LEFT, 0x27 = RIGHT,
    //   0x44 = D,    0x73 = F4,   0x09 = TAB
    let combo: &[u8] = match action {
        VirtualDesktopAction::SwitchLeft => &[0x5B, 0x11, 0x25],
        VirtualDesktopAction::SwitchRight => &[0x5B, 0x11, 0x27],
        VirtualDesktopAction::Create => &[0x5B, 0x11, 0x44],
        VirtualDesktopAction::CloseCurrent => &[0x5B, 0x11, 0x73],
        VirtualDesktopAction::TaskView => &[0x5B, 0x09],
    };
    let mut down = String::new();
    let mut up = String::new();
    for &vk in combo {
        down.push_str(&format!(
            "$T::keybd_event([byte]0x{:02X}, 0, 0, [UIntPtr]::Zero); ",
            vk
        ));
    }
    for &vk in combo.iter().rev() {
        up.push_str(&format!(
            "$T::keybd_event([byte]0x{:02X}, 0, 2, [UIntPtr]::Zero); ",
            vk
        ));
    }
    let script = format!(
        r#"
$sig = '[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);'
$T = Add-Type -MemberDefinition $sig -Name 'KeySendVD' -Namespace 'Komorebi' -PassThru
{down}
Start-Sleep -Milliseconds 30
{up}
"#,
        down = down,
        up = up,
    );
    run_powershell(&script)
}

#[cfg(target_os = "windows")]
fn run_powershell(script: &str) -> Result<(), DesktopError> {
    let out = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .output()
        .map_err(|e| DesktopError::Input(format!("spawn powershell: {e}")))?;
    if !out.status.success() {
        return Err(DesktopError::Input(format!(
            "powershell exit {}: {}",
            out.status,
            String::from_utf8_lossy(&out.stderr)
        )));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn perform(_action: VirtualDesktopAction) -> Result<(), DesktopError> {
    Err(DesktopError::Input(
        "virtual desktops are Windows-only".into(),
    ))
}
