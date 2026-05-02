//! Screenshot skill — capture the primary display to a PNG file using
//! platform-native command-line tools so we don't need any native GUI
//! dependencies (xcap, CoreGraphics bindings, etc).
//!
//! The file is written into the user's pictures directory (or the system
//! temp dir as fallback) under `Komorebi/screenshot-<ts>.png`. The reply
//! contains the absolute path so the user (and, later, the assistant) can
//! reference it.
//!
//! Platforms:
//!   * macOS   — `screencapture -x <path>` (built-in)
//!   * Windows — PowerShell + System.Drawing (built-in)
//!   * Linux   — tries `gnome-screenshot`, `grim`, `scrot`, `import`
//!     in that order. If none are found, returns an informative error.

use async_trait::async_trait;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::{norm, Skill, SkillContext, SkillError, SkillResponse};

pub struct ScreenshotSkill;

fn triggers(query: &str) -> bool {
    let q = norm(query);
    // RU
    q.contains("скриншот") || q.contains("скрин") || q.contains("снимок экрана") || q.contains("снимок рабочего стола")
    // EN
    || q.contains("screenshot") || q.contains("screen shot") || q.contains("screen capture")
    || q.contains("capture screen") || q.contains("take screen") || q.contains("print screen") || q.contains("prtsc")
    // UK
    || q.contains("знімок екран") || q.contains("скріншот") || q.contains("скрін") || q.contains("зніми екран")
}

fn output_dir() -> PathBuf {
    let base = dirs::picture_dir().unwrap_or_else(std::env::temp_dir);
    base.join("Komorebi")
}

#[cfg(target_os = "macos")]
fn capture(path: &Path) -> Result<(), SkillError> {
    let status = Command::new("screencapture")
        .args(["-x", &path.display().to_string()])
        .status()
        .map_err(|e| SkillError::Exec(format!("screencapture: {e}")))?;
    if !status.success() {
        return Err(SkillError::Exec(format!(
            "screencapture exited with {status}"
        )));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn capture(path: &Path) -> Result<(), SkillError> {
    let script = format!(
        r#"Add-Type -AssemblyName System.Windows.Forms,System.Drawing;
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height;
$g = [System.Drawing.Graphics]::FromImage($bmp);
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size);
$bmp.Save('{}', [System.Drawing.Imaging.ImageFormat]::Png);
$g.Dispose(); $bmp.Dispose();"#,
        path.display().to_string().replace('\'', "''")
    );
    let status = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .status()
        .map_err(|e| SkillError::Exec(format!("powershell: {e}")))?;
    if !status.success() {
        return Err(SkillError::Exec(format!("powershell exited with {status}")));
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn capture(path: &Path) -> Result<(), SkillError> {
    let p = path.display().to_string();
    let attempts: &[(&str, Vec<&str>)] = &[
        ("gnome-screenshot", vec!["-f", &p]),
        ("grim", vec![&p]),
        ("scrot", vec![&p]),
        ("import", vec!["-window", "root", &p]),
    ];
    for (tool, args) in attempts {
        match Command::new(tool).args(args).status() {
            Ok(s) if s.success() => return Ok(()),
            Ok(s) => {
                tracing::debug!(tool, status = ?s, "screenshot tool failed, trying next");
            }
            Err(e) => {
                tracing::debug!(tool, error = %e, "screenshot tool missing, trying next");
            }
        }
    }
    Err(SkillError::Exec(
        "no screenshot tool found (install gnome-screenshot, grim, scrot, or imagemagick)".into(),
    ))
}

#[async_trait]
impl Skill for ScreenshotSkill {
    fn name(&self) -> &'static str {
        "screenshot"
    }

    fn matches(&self, query: &str) -> bool {
        triggers(query)
    }

    async fn execute(&self, _ctx: SkillContext) -> Result<SkillResponse, SkillError> {
        tokio::task::spawn_blocking(|| -> Result<SkillResponse, SkillError> {
            let dir = output_dir();
            std::fs::create_dir_all(&dir)
                .map_err(|e| SkillError::Exec(format!("create_dir_all: {e}")))?;
            let ts = chrono::Local::now().format("%Y%m%d-%H%M%S");
            let path = dir.join(format!("screenshot-{ts}.png"));
            capture(&path)?;
            Ok(SkillResponse {
                text: format!("Saved screenshot to {}", path.display()),
            })
        })
        .await
        .map_err(|e| SkillError::Exec(format!("join error: {e}")))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_screenshot_queries() {
        assert!(triggers("сделай скриншот"));
        assert!(triggers("take a screenshot"));
        assert!(triggers("снимок экрана"));
        assert!(!triggers("привет"));
    }
}
