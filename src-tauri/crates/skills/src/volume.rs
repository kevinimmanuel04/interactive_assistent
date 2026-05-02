//! Volume skill — set or query system output volume.
//!
//! Cross-platform via shell-outs to keep the dependency footprint small:
//!   * Windows — PowerShell + WScript.Shell SendKeys VK_VOLUME_UP/DOWN for
//!     relative changes; absolute levels are achieved by stepping from 0.
//!   * macOS   — `osascript -e "set volume output volume N"`
//!   * Linux   — `pactl set-sink-volume @DEFAULT_SINK@ N%`
//!
//! Queries supported:
//!   - "громкость 50", "volume 50%"  → absolute (0..=100)
//!   - "громче", "louder", "volume up"        → +10
//!   - "тише", "quieter", "volume down"       → -10
//!   - "выключи звук", "mute"                 → 0

use async_trait::async_trait;

use crate::{norm, Skill, SkillContext, SkillError, SkillResponse};

pub struct VolumeSkill;

enum Action {
    Set(u8),
    Delta(i8),
    Mute,
}

fn parse(query: &str) -> Option<Action> {
    let q = norm(query);
    // Topic check (RU/EN/UK).
    let is_volume_kw = q.contains("громкост")           // RU
        || q.contains("громче")
        || q.contains("тише")
        || q.contains("звук")
        || q.contains("volume")                         // EN
        || q.contains("louder")
        || q.contains("quieter")
        || q.contains("sound")
        || q.contains("mute")
        || q.contains("unmute")
        || q.contains("гучніст")                        // UK
        || q.contains("гучніше")
        || q.contains("тихіше")
        || q.contains("гучн")
        || q.contains("вимкни звук")
        || q.contains("вимкнути звук")
        || q.contains("выключи звук")
        || q.contains("приглуши")
        || q.contains("приглуш");
    if !is_volume_kw {
        return None;
    }
    if q.contains("unmute")
        || q.contains("включи звук")
        || q.contains("увімкни звук")
        || q.contains("увімкнути звук")
    {
        // Treat as max volume bump (no separate Unmute action).
        return Some(Action::Delta(20));
    }
    if q.contains("mute")
        || q.contains("выключи звук")
        || q.contains("вырубай звук")
        || q.contains("вимкни звук")
        || q.contains("вимкнути звук")
    {
        return Some(Action::Mute);
    }
    // Absolute: first integer 0..=100 wins.
    let mut digits = String::new();
    for ch in q.chars() {
        if ch.is_ascii_digit() {
            digits.push(ch);
        } else if !digits.is_empty() {
            break;
        }
    }
    if let Ok(n) = digits.parse::<u16>() {
        if n <= 100 {
            return Some(Action::Set(n as u8));
        }
    }
    if q.contains("громче")
        || q.contains("louder")
        || q.contains("гучніше")
        || q.contains("up")
        || q.contains("повыш")
        || q.contains("подними")
        || q.contains("підвищ")
        || q.contains("підніми")
    {
        return Some(Action::Delta(10));
    }
    if q.contains("тише")
        || q.contains("quieter")
        || q.contains("тихіше")
        || q.contains("down")
        || q.contains("понизь")
        || q.contains("уменьш")
        || q.contains("знизь")
        || q.contains("зменш")
        || q.contains("приглуш")
    {
        return Some(Action::Delta(-10));
    }
    None
}

#[async_trait]
impl Skill for VolumeSkill {
    fn name(&self) -> &'static str {
        "volume"
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
fn apply(action: Action) -> Result<String, SkillError> {
    // Use PowerShell + WScript.Shell.SendKeys with VK codes:
    //   0xAD (173) = VOLUME_MUTE, 0xAE (174) = VOLUME_DOWN, 0xAF (175) = VOLUME_UP
    // Each VOLUME_UP/DOWN tap changes master output by ~2 percentage points.
    let (steps_up, steps_down, mute, label) = match action {
        Action::Mute => (0, 0, true, "Muted".to_string()),
        Action::Set(n) => {
            // Reset to 0 by pressing VOLUME_DOWN 50 times (100% -> 0%), then
            // press VOLUME_UP ceil(n / 2) times.
            (((n as i32) + 1) / 2, 50, false, format!("Volume ≈ {n}%"))
        }
        Action::Delta(d) => {
            if d > 0 {
                ((d as i32 + 1) / 2, 0, false, format!("Volume +{d}"))
            } else {
                (0, (-d as i32 + 1) / 2, false, format!("Volume {d}"))
            }
        }
    };
    let mut script = String::from("$w = New-Object -ComObject WScript.Shell;");
    if mute {
        script.push_str(" $w.SendKeys([char]173);");
    }
    for _ in 0..steps_down {
        script.push_str(" $w.SendKeys([char]174);");
    }
    for _ in 0..steps_up {
        script.push_str(" $w.SendKeys([char]175);");
    }
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .status()
        .map_err(|e| SkillError::Exec(format!("powershell: {e}")))?;
    if !status.success() {
        return Err(SkillError::Exec("powershell exit != 0".into()));
    }
    Ok(label)
}

#[cfg(target_os = "macos")]
fn apply(action: Action) -> Result<String, SkillError> {
    let (script, label) = match action {
        Action::Mute => (
            "set volume output muted true".to_string(),
            "Muted".to_string(),
        ),
        Action::Set(n) => (
            format!("set volume output volume {n}"),
            format!("Volume {n}%"),
        ),
        Action::Delta(d) => (
            format!("set volume output volume ((output volume of (get volume settings)) + {d})"),
            format!("Volume {:+}", d),
        ),
    };
    let status = std::process::Command::new("osascript")
        .args(["-e", &script])
        .status()
        .map_err(|e| SkillError::Exec(format!("osascript: {e}")))?;
    if !status.success() {
        return Err(SkillError::Exec("osascript exit != 0".into()));
    }
    Ok(label)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn apply(action: Action) -> Result<String, SkillError> {
    let (args, label): (Vec<String>, String) = match action {
        Action::Mute => (
            vec!["set-sink-mute".into(), "@DEFAULT_SINK@".into(), "1".into()],
            "Muted".to_string(),
        ),
        Action::Set(n) => (
            vec![
                "set-sink-volume".into(),
                "@DEFAULT_SINK@".into(),
                format!("{n}%"),
            ],
            format!("Volume {n}%"),
        ),
        Action::Delta(d) => (
            vec![
                "set-sink-volume".into(),
                "@DEFAULT_SINK@".into(),
                if d >= 0 {
                    format!("+{d}%")
                } else {
                    format!("{d}%")
                },
            ],
            format!("Volume {:+}", d),
        ),
    };
    let status = std::process::Command::new("pactl")
        .args(args.iter().map(String::as_str))
        .status()
        .map_err(|e| SkillError::Exec(format!("pactl: {e}")))?;
    if !status.success() {
        return Err(SkillError::Exec("pactl exit != 0".into()));
    }
    Ok(label)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_absolute() {
        assert!(matches!(parse("громкость 50%"), Some(Action::Set(50))));
        assert!(matches!(parse("volume 0"), Some(Action::Set(0))));
        assert!(matches!(parse("set volume to 100"), Some(Action::Set(100))));
        // Common Russian phrasing the user actually types/speaks: «сделай звук 50%».
        assert!(matches!(parse("сделай звук 50%"), Some(Action::Set(50))));
        assert!(matches!(parse("зроби гучність 70"), Some(Action::Set(70))));
    }

    #[test]
    fn parses_relative() {
        assert!(matches!(parse("громче"), Some(Action::Delta(10))));
        assert!(matches!(parse("тише"), Some(Action::Delta(-10))));
    }

    #[test]
    fn parses_mute() {
        assert!(matches!(parse("mute"), Some(Action::Mute)));
        assert!(matches!(parse("выключи звук"), Some(Action::Mute)));
    }

    #[test]
    fn ignores_unrelated() {
        assert!(parse("привет").is_none());
        assert!(parse("make me a sandwich").is_none());
    }

    #[test]
    fn rejects_out_of_range() {
        // 150 is not a valid volume; falls through to delta parsing which also
        // fails because no up/down keyword is present.
        assert!(parse("volume 150").is_none());
    }
}
