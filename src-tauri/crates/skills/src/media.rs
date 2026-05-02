//! Media-control skill — play/pause/next/previous via Windows SMTC.
//!
//! Cross-platform plumbing:
//!   * Windows — sends the corresponding VK_MEDIA_* keystroke through
//!     `WScript.Shell.SendKeys`. The OS then routes it through the
//!     System Media Transport Controls session manager to whichever
//!     app is currently the active media source (Spotify, browser
//!     YouTube tab, foobar2000, etc.). This is the same path Microsoft's
//!     own media keys use, so it works universally.
//!   * macOS   — uses `osascript` "tell application System Events to key
//!     code 100/101/97/98" (F7..F10 / play-pause).
//!   * Linux   — `playerctl play-pause / next / previous` (requires
//!     playerctl installed; we surface a hint if missing).
//!
//! Queries supported (RU + EN):
//!   - "play", "pause", "включи музыку", "поставь на паузу"
//!   - "next track", "следующий трек", "next"
//!   - "previous track", "предыдущий трек", "prev"
//!   - "stop", "стоп"

use async_trait::async_trait;

use crate::{norm, Skill, SkillContext, SkillError, SkillResponse};

pub struct MediaSkill;

#[derive(Debug, Clone, Copy)]
enum MediaAction {
    PlayPause,
    Next,
    Prev,
    Stop,
}

fn parse(query: &str) -> Option<MediaAction> {
    let q = norm(query);
    let is_media_kw = q.contains("media")
        // RU
        || q.contains("музык")
        || q.contains("трек")
        || q.contains("песн")
        || q.contains("пауз")
        || q.contains("следующ")
        || q.contains("предыдущ")
        || q.contains("включи")
        || q.contains("выключи")
        || q.contains("стоп")
        // EN
        || q.contains("track")
        || q.contains("song")
        || q.contains("music")
        || q.contains("play")
        || q.contains("pause")
        || q.contains("resume")
        || q.contains("next")
        || q.contains("prev")
        || q.contains("skip")
        || q.contains("stop")
        // UK
        || q.contains("музик")
        || q.contains("пісн")
        || q.contains("наступн")
        || q.contains("попередн")
        || q.contains("грай")
        || q.contains("відтвор")
        || q.contains("пауза")
        || q.contains("зупини");
    if !is_media_kw {
        return None;
    }
    if q.contains("next")
        || q.contains("skip")
        || q.contains("следующ")
        || q.contains("наступн")
        || q.contains("вперёд")
        || q.contains("вперед")
        || q.contains("вперед")
    {
        return Some(MediaAction::Next);
    }
    if q.contains("prev") || q.contains("предыдущ") || q.contains("попередн") || q.contains("назад")
    {
        return Some(MediaAction::Prev);
    }
    if q.contains("stop") || q.contains("стоп") || q.contains("зупини") {
        return Some(MediaAction::Stop);
    }
    if q.contains("pause") || q.contains("пауз") {
        return Some(MediaAction::PlayPause);
    }
    if q.contains("play")
        || q.contains("resume")
        || q.contains("включи")
        || q.contains("увімкни")
        || q.contains("продолж")
        || q.contains("продовж")
        || q.contains("грай")
        || q.contains("відтвор")
    {
        return Some(MediaAction::PlayPause);
    }
    None
}

#[async_trait]
impl Skill for MediaSkill {
    fn name(&self) -> &'static str {
        "media"
    }

    fn matches(&self, query: &str) -> bool {
        parse(query).is_some()
    }

    async fn execute(&self, ctx: SkillContext) -> Result<SkillResponse, SkillError> {
        let action = parse(&ctx.query).ok_or(SkillError::NotApplicable)?;
        apply(action).map(|text| SkillResponse { text })
    }
}

#[cfg(target_os = "windows")]
fn apply(action: MediaAction) -> Result<String, SkillError> {
    // SendKeys VK codes for media keys:
    //   0xB3 (179) = VK_MEDIA_PLAY_PAUSE
    //   0xB2 (178) = VK_MEDIA_STOP
    //   0xB0 (176) = VK_MEDIA_NEXT_TRACK
    //   0xB1 (177) = VK_MEDIA_PREV_TRACK
    let (vk, label) = match action {
        MediaAction::PlayPause => (0xB3u32, "Play/Pause"),
        MediaAction::Stop => (0xB2u32, "Stopped"),
        MediaAction::Next => (0xB0u32, "Next track"),
        MediaAction::Prev => (0xB1u32, "Previous track"),
    };
    // Use the Win32 keybd_event API via PowerShell P/Invoke. SendKeys
    // doesn't natively support media keys; keybd_event does and is
    // bundled with every Windows version we care about.
    let script = format!(
        r#"
$signature = @'
[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
'@
$Type = Add-Type -MemberDefinition $signature -Name 'KeyboardSend' -Namespace 'Komorebi' -PassThru
$Type::keybd_event([byte]{vk}, 0, 0, [UIntPtr]::Zero)
$Type::keybd_event([byte]{vk}, 0, 2, [UIntPtr]::Zero)
"#
    );
    run_powershell(&script)?;
    // Best-effort current title via SMTC for a friendlier reply.
    let now = current_track_title().unwrap_or_default();
    if now.is_empty() {
        Ok(label.to_string())
    } else {
        Ok(format!("{label}: {now}"))
    }
}

#[cfg(target_os = "windows")]
fn current_track_title() -> Option<String> {
    // Query the current SMTC session for "Title — Artist". The WinRT
    // surface is awaitable; we run a small async PowerShell snippet and
    // capture stdout. Times out fast so we never block the skill reply.
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] > $null
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
    Select-Object -First 1
function Wait-WinRT($op) {
    $task = $asTask.MakeGenericMethod($op.GetType().GetGenericArguments()).Invoke($null, @($op))
    $task.Wait(2000) > $null
    return $task.Result
}
$mgr = Wait-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync())
if ($mgr -ne $null) {
    $sess = $mgr.GetCurrentSession()
    if ($sess -ne $null) {
        $info = Wait-WinRT $sess.TryGetMediaPropertiesAsync()
        if ($info -ne $null) {
            $title = $info.Title
            $artist = $info.Artist
            if ([string]::IsNullOrWhiteSpace($title)) { return }
            if ([string]::IsNullOrWhiteSpace($artist)) { Write-Output $title }
            else { Write-Output ("{0} — {1}" -f $title, $artist) }
        }
    }
}
"#;
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
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

#[cfg(target_os = "windows")]
fn run_powershell(script: &str) -> Result<(), SkillError> {
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
        .map_err(|e| SkillError::Exec(format!("spawn powershell: {e}")))?;
    if !out.status.success() {
        return Err(SkillError::Exec(format!(
            "powershell exit {}: {}",
            out.status,
            String::from_utf8_lossy(&out.stderr)
        )));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn apply(action: MediaAction) -> Result<String, SkillError> {
    // macOS keycodes: 100 = F8 (play/pause), 101 = F9 (next),
    // 98 = F7 (prev), 97 = F8 stop. We use AppleScript media key.
    let key = match action {
        MediaAction::PlayPause => 100,
        MediaAction::Next => 101,
        MediaAction::Prev => 98,
        MediaAction::Stop => 97,
    };
    let script = format!("tell application \"System Events\" to key code {key}");
    let status = std::process::Command::new("osascript")
        .args(["-e", &script])
        .status()
        .map_err(|e| SkillError::Exec(e.to_string()))?;
    if !status.success() {
        return Err(SkillError::Exec("osascript failed".into()));
    }
    Ok(format!("Media: {:?}", action))
}

#[cfg(target_os = "linux")]
fn apply(action: MediaAction) -> Result<String, SkillError> {
    let arg = match action {
        MediaAction::PlayPause => "play-pause",
        MediaAction::Next => "next",
        MediaAction::Prev => "previous",
        MediaAction::Stop => "stop",
    };
    let status = std::process::Command::new("playerctl")
        .arg(arg)
        .status()
        .map_err(|e| {
            SkillError::Exec(format!(
                "playerctl missing? install it via your package manager: {e}"
            ))
        })?;
    if !status.success() {
        return Err(SkillError::Exec("playerctl failed".into()));
    }
    Ok(format!("Media: {arg}"))
}
