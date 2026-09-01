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
    let clean = app
        .trim()
        .trim_matches(&['.', ',', '!', '?', '\'', '"'][..]);

    let norm_name = clean
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '-' || *c == '_')
        .collect::<String>()
        .to_lowercase();
    let name = norm_name.trim();

    if name.is_empty() {
        return Err(SkillError::Exec("Empty application name".into()));
    }

    // Tier 1: System Aliases & Protocols
    if name == "file explorer" || name == "explorer" || name == "this pc" || name == "my computer" || name == "files" || name == "file" {
        let _ = std::process::Command::new("explorer.exe").spawn();
        return Ok(());
    }

    if name.contains("riot") || name.contains("valorant") || name.contains("league") {
        let riot_paths = [
            r"C:\Riot Games\Riot Client\RiotClientServices.exe",
            r"C:\Program Files\Riot Games\Riot Client\RiotClientServices.exe",
            r"C:\Program Files (x86)\Riot Games\Riot Client\RiotClientServices.exe",
        ];
        for path in &riot_paths {
            if std::path::Path::new(path).exists() {
                if let Ok(_) = std::process::Command::new(path).spawn() {
                    return Ok(());
                }
            }
        }
        let script = "Start-Process 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe' -ErrorAction SilentlyContinue; if (!$?) { Start-Process 'riotclient:' }";
        let _ = std::process::Command::new("powershell").args(["-NoProfile", "-Command", script]).spawn();
        return Ok(());
    }

    if name.contains("store") || name.contains("microsoft store") {
        let _ = std::process::Command::new("powershell").args(["-NoProfile", "-Command", "Start-Process 'ms-windows-store:'"]).spawn();
        return Ok(());
    }

    if name == "chrome" || name == "google chrome" {
        if let Ok(_) = std::process::Command::new("chrome.exe").spawn() {
            return Ok(());
        }
    }

    if name == "notepad" {
        if let Ok(_) = std::process::Command::new("notepad.exe").spawn() {
            return Ok(());
        }
    }

    if name == "calculator" || name == "calc" {
        let _ = std::process::Command::new("powershell").args(["-NoProfile", "-Command", "Start-Process 'calculator:'"]).spawn();
        return Ok(());
    }

    if name == "spotify" {
        let _ = std::process::Command::new("powershell").args(["-NoProfile", "-Command", "Start-Process 'spotify:'"]).spawn();
        return Ok(());
    }

    if name == "vs code" || name == "vscode" || name == "code" {
        if let Ok(_) = std::process::Command::new("code.cmd").spawn() {
            return Ok(());
        }
        if let Ok(_) = std::process::Command::new("code").spawn() {
            return Ok(());
        }
    }

    // Tier 2: PowerShell Start Menu & Registry Search Algorithm
    let ps_search = format!(
        "$app = Get-ChildItem -Path '$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs', '$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs' -Recurse -Include *.lnk | Where-Object {{ $_.Name -like '*{name}*' }} | Select-Object -First 1; if ($app) {{ Start-Process $app.FullName }} else {{ Start-Process '{name}' -ErrorAction SilentlyContinue }}"
    );
    
    let res = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_search])
        .spawn();

    match res {
        Ok(_) => Ok(()),
        Err(e) => Err(SkillError::Exec(format!("Could not launch app '{name}': {e}"))),
    }
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
