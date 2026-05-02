//! Open skill — launch a URL, file, or application via the OS default handler.
//!
//! Queries supported:
//!   - "open https://github.com"      → opens URL in the default browser
//!   - "открой https://…" / "запусти …"
//!   - "open notepad" / "запусти notepad" → launches an executable by name
//!     (relies on PATH / App Paths on Windows, Launch Services on macOS).

use async_trait::async_trait;

use crate::{norm, Skill, SkillContext, SkillError, SkillResponse};

pub struct OpenSkill;

enum Target {
    Url(String),
    App(String),
}

fn parse(query: &str) -> Option<Target> {
    let q = norm(query);
    let prefixes = [
        "open ", // EN
        "launch ",
        "start ",
        "run ",
        "открой ", // RU
        "открыть ",
        "запусти ",
        "запустить ",
        "включи ",
        "відкрий ", // UK
        "відкрити ",
        "запустити ",
        "увімкни ",
    ];
    let mut rest: Option<&str> = None;
    for p in prefixes {
        if let Some(idx) = q.find(p) {
            // Take payload from the *original* query to preserve case (URLs,
            // Windows app names like "Notepad").
            rest = Some(query[idx + p.len()..].trim());
            break;
        }
    }
    let payload = rest?.trim();
    if payload.is_empty() {
        return None;
    }
    if payload.starts_with("http://") || payload.starts_with("https://") || payload.contains("://")
    {
        return Some(Target::Url(payload.to_string()));
    }
    // Plain hostname like "github.com" → promote to https.
    if payload.contains('.')
        && !payload.contains(' ')
        && payload.chars().all(|c| c.is_ascii_graphic())
    {
        return Some(Target::Url(format!("https://{payload}")));
    }
    Some(Target::App(payload.to_string()))
}

#[async_trait]
impl Skill for OpenSkill {
    fn name(&self) -> &'static str {
        "open"
    }

    fn matches(&self, query: &str) -> bool {
        parse(query).is_some()
    }

    async fn execute(&self, ctx: SkillContext) -> Result<SkillResponse, SkillError> {
        let target = parse(&ctx.query).ok_or(SkillError::NotApplicable)?;
        tokio::task::spawn_blocking(move || -> Result<SkillResponse, SkillError> {
            match target {
                Target::Url(url) => {
                    opener::open(&url).map_err(|e| SkillError::Exec(format!("open {url}: {e}")))?;
                    Ok(SkillResponse {
                        text: format!("Opened {url}"),
                    })
                }
                Target::App(app) => {
                    launch_app(&app)?;
                    Ok(SkillResponse {
                        text: format!("Launched {app}"),
                    })
                }
            }
        })
        .await
        .map_err(|e| SkillError::Exec(format!("join error: {e}")))?
    }
}

#[cfg(target_os = "windows")]
fn launch_app(app: &str) -> Result<(), SkillError> {
    // `cmd /C start "" <app>` resolves App Paths (so "notepad", "calc",
    // "msedge" all work) and doesn't keep a console window attached.
    let status = std::process::Command::new("cmd")
        .args(["/C", "start", "", app])
        .status()
        .map_err(|e| SkillError::Exec(format!("spawn cmd: {e}")))?;
    if !status.success() {
        return Err(SkillError::Exec(format!("cmd start {app} exit != 0")));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn launch_app(app: &str) -> Result<(), SkillError> {
    let status = std::process::Command::new("open")
        .args(["-a", app])
        .status()
        .map_err(|e| SkillError::Exec(format!("spawn open: {e}")))?;
    if !status.success() {
        return Err(SkillError::Exec(format!("open -a {app} exit != 0")));
    }
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn launch_app(app: &str) -> Result<(), SkillError> {
    // On Linux, assume `app` is on PATH. Detach via spawn so the child isn't
    // tied to our lifetime.
    std::process::Command::new(app)
        .spawn()
        .map_err(|e| SkillError::Exec(format!("spawn {app}: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_url() {
        match parse("open https://github.com") {
            Some(Target::Url(u)) => assert_eq!(u, "https://github.com"),
            _ => panic!("expected Url"),
        }
    }

    #[test]
    fn promotes_bare_host() {
        match parse("открой github.com") {
            Some(Target::Url(u)) => assert_eq!(u, "https://github.com"),
            _ => panic!("expected Url"),
        }
    }

    #[test]
    fn parses_app() {
        match parse("запусти Notepad") {
            Some(Target::App(a)) => assert_eq!(a, "Notepad"),
            _ => panic!("expected App"),
        }
    }

    #[test]
    fn ignores_unrelated() {
        assert!(parse("привет").is_none());
        assert!(parse("open").is_none()); // empty payload
    }
}
