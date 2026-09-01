//! Settings snapshot + system info commands.

use crate::settings;
use tauri::{AppHandle, Manager, WebviewWindow, Wry};

#[tauri::command]
pub fn get_settings(app: AppHandle<Wry>) -> settings::PublicSettings {
    settings::public_snapshot(&app)
}

/// Returns cached machine info so the settings page can show detected GPUs
/// and let the user know whether local-LLM GPU offload is feasible.
#[tauri::command]
pub fn system_info() -> serde_json::Value {
    let snap = crate::sysctx::snapshot();
    serde_json::json!({
        "os": snap.os_long,
        "cpu": snap.cpu_brand,
        "cpu_cores": snap.cpu_cores,
        "ram_gb": snap.total_memory_gb,
        "gpus": snap.gpus,
        "has_nvidia": crate::sysctx::has_nvidia_gpu(),
        "hostname": snap.hostname,
    })
}

#[tauri::command]
pub fn minimize_window(app: AppHandle<Wry>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_skip_taskbar(false);
        let _ = w.minimize();
    }
    if let Some(w) = app.get_webview_window("chat") {
        let _ = w.set_skip_taskbar(false);
        let _ = w.minimize();
    }
}

#[tauri::command]
pub fn maximize_window(app: AppHandle<Wry>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_skip_taskbar(false);
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    if let Some(w) = app.get_webview_window("chat") {
        let _ = w.set_skip_taskbar(false);
        let _ = w.show();
        let _ = w.unminimize();
        if w.is_maximized().unwrap_or(false) {
            let _ = w.unmaximize();
        } else {
            let _ = w.maximize();
        }
        let _ = w.set_focus();
    }
}

#[tauri::command]
pub fn open_app_cmd(name: String) -> Result<bool, String> {
    let clean = name
        .trim()
        .trim_matches(&['.', ',', '!', '?', '\'', '"'][..]);

    let norm_name = clean
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '-' || *c == '_')
        .collect::<String>()
        .to_lowercase();
    let name_str = norm_name.trim();

    if name_str.is_empty() {
        return Err("Empty application name".into());
    }

    // Tier 1: Built-in Windows System Protocol Map & Common App Shortcuts
    match name_str {
        "file explorer" | "explorer" | "this pc" | "my computer" | "files" | "file" => {
            let _ = std::process::Command::new("explorer.exe").spawn();
            return Ok(true);
        }
        "settings" | "windows settings" | "system settings" => {
            let _ = std::process::Command::new("powershell").args(["-NoProfile", "-Command", "Start-Process 'ms-settings:'"]).spawn();
            return Ok(true);
        }
        "microsoft store" | "ms store" | "store" => {
            let _ = std::process::Command::new("powershell").args(["-NoProfile", "-Command", "Start-Process 'ms-windows-store:'"]).spawn();
            return Ok(true);
        }
        "calculator" | "calc" => {
            let _ = std::process::Command::new("powershell").args(["-NoProfile", "-Command", "Start-Process 'calculator:'"]).spawn();
            return Ok(true);
        }
        "clock" | "alarm" | "stopwatch" => {
            let _ = std::process::Command::new("powershell").args(["-NoProfile", "-Command", "Start-Process 'ms-clock:'"]).spawn();
            return Ok(true);
        }
        "camera" => {
            let _ = std::process::Command::new("powershell").args(["-NoProfile", "-Command", "Start-Process 'microsoft.windows.camera:'"]).spawn();
            return Ok(true);
        }
        "photos" => {
            let _ = std::process::Command::new("powershell").args(["-NoProfile", "-Command", "Start-Process 'ms-photos:'"]).spawn();
            return Ok(true);
        }
        "snipping tool" | "snip" => {
            let _ = std::process::Command::new("powershell").args(["-NoProfile", "-Command", "Start-Process 'ms-snippingtool:'"]).spawn();
            return Ok(true);
        }
        "paint" => {
            let _ = std::process::Command::new("mspaint.exe").spawn();
            return Ok(true);
        }
        "control panel" => {
            let _ = std::process::Command::new("control.exe").spawn();
            return Ok(true);
        }
        "task manager" => {
            let _ = std::process::Command::new("taskmgr.exe").spawn();
            return Ok(true);
        }
        "device manager" => {
            let _ = std::process::Command::new("mmc.exe").arg("devmgmt.msc").spawn();
            return Ok(true);
        }
        "command prompt" | "cmd" => {
            let _ = std::process::Command::new("cmd.exe").spawn();
            return Ok(true);
        }
        "powershell" => {
            let _ = std::process::Command::new("powershell.exe").spawn();
            return Ok(true);
        }
        "terminal" => {
            if std::process::Command::new("wt.exe").spawn().is_ok() {
                return Ok(true);
            }
            let _ = std::process::Command::new("cmd.exe").spawn();
            return Ok(true);
        }
        "notepad" => {
            if std::process::Command::new("notepad.exe").spawn().is_ok() {
                return Ok(true);
            }
        }
        "chrome" | "google chrome" => {
            if std::process::Command::new("chrome.exe").spawn().is_ok() {
                return Ok(true);
            }
        }
        "edge" | "microsoft edge" => {
            let _ = std::process::Command::new("powershell").args(["-NoProfile", "-Command", "Start-Process 'msedge:'"]).spawn();
            return Ok(true);
        }
        "spotify" => {
            let _ = std::process::Command::new("powershell").args(["-NoProfile", "-Command", "Start-Process 'spotify:'"]).spawn();
            return Ok(true);
        }
        "vs code" | "vscode" | "code" => {
            if std::process::Command::new("code.cmd").spawn().is_ok() || std::process::Command::new("code").spawn().is_ok() {
                return Ok(true);
            }
        }
        _ => {}
    }

    if name_str.contains("riot") || name_str.contains("valorant") || name_str.contains("league") {
        let riot_paths = [
            r"C:\Riot Games\Riot Client\RiotClientServices.exe",
            r"C:\Program Files\Riot Games\Riot Client\RiotClientServices.exe",
            r"C:\Program Files (x86)\Riot Games\Riot Client\RiotClientServices.exe",
        ];
        for path in &riot_paths {
            if std::path::Path::new(path).exists() {
                if let Ok(_) = std::process::Command::new(path).spawn() {
                    return Ok(true);
                }
            }
        }
        let script = "Start-Process 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe' -ErrorAction SilentlyContinue; if (!$?) { Start-Process 'riotclient:' }";
        let _ = std::process::Command::new("powershell").args(["-NoProfile", "-Command", script]).spawn();
        return Ok(true);
    }

    // Tier 2: Universal PowerShell Start Menu & Registry Discovery Algorithm
    let ps_search = format!(
        "$dirs = @('$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs', '$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs', 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu'); $app = Get-ChildItem -Path $dirs -Recurse -Filter *.lnk -ErrorAction SilentlyContinue | Where-Object {{ $_.Name -like '*{name_str}*' -or $_.BaseName -like '*{name_str}*' }} | Select-Object -First 1; if ($app) {{ Start-Process $app.FullName }} else {{ $reg = Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\*' -ErrorAction SilentlyContinue | Where-Object {{ $_.PSChildName -like '*{name_str}*' }} | Select-Object -First 1; if ($reg) {{ Start-Process $reg.'(default)' }} else {{ Start-Process '{name_str}' -ErrorAction SilentlyContinue }} }}"
    );
    
    let res = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_search])
        .spawn();

    match res {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Could not launch app '{name_str}': {e}")),
    }
}

fn url_encode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            ' ' => "+".to_string(),
            other => format!("%{:02X}", other as u8),
        })
        .collect()
}

#[tauri::command]
pub fn open_url_cmd(url: String) -> Result<bool, String> {
    let clean = url
        .trim()
        .trim_matches(&['.', ',', '!', '?', '\'', '"'][..]);
    if clean.is_empty() {
        return Err("Empty URL or search query".into());
    }

    let target_url = if clean.starts_with("http://") || clean.starts_with("https://") {
        clean.to_string()
    } else {
        let lower = clean.to_lowercase();
        if lower.contains("youtube") {
            let q = lower
                .replace("on youtube", "")
                .replace("in youtube", "")
                .replace("youtube", "")
                .replace("search for", "")
                .replace("search", "")
                .trim()
                .to_string();
            format!("https://www.youtube.com/results?search_query={}", url_encode(&q))
        } else {
            let q = lower
                .replace("on browser", "")
                .replace("in browser", "")
                .replace("search for", "")
                .replace("search", "")
                .replace("google", "")
                .trim()
                .to_string();
            format!("https://www.google.com/search?q={}", url_encode(if q.is_empty() { clean } else { &q }))
        }
    };

    let ps_cmd = format!("Start-Process '{}'", target_url);
    let res = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_cmd])
        .spawn();

    match res {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Failed to open URL '{clean}': {e}")),
    }
}

#[tauri::command]
pub fn open_folder_or_file_cmd(target: String) -> Result<bool, String> {
    let clean = target.trim().trim_matches(&['.', ',', '!', '?', '\'', '"'][..]);
    let norm = clean.to_lowercase();

    // 1. Universal Drive Letter Recognition ("c drive", "d drive", "drive c", "g drive", "c:")
    let words: Vec<&str> = norm.split_whitespace().collect();
    for w in &words {
        let clean_w = w.trim_matches(&[':', '\\', '/'][..]);
        if clean_w.len() == 1 && clean_w.chars().next().unwrap().is_ascii_alphabetic() {
            let letter = clean_w.to_uppercase();
            if norm.contains("drive") || norm.contains("disk") || words.len() <= 2 {
                let drive_path = format!("{}:\\", letter);
                if std::path::Path::new(&drive_path).exists() {
                    let _ = std::process::Command::new("explorer.exe").arg(&drive_path).spawn();
                    return Ok(true);
                }
            }
        }
    }

    let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| r"C:\Users\Default".to_string());

    // 2. Fast-Path Pinpoint Special Windows Folders
    if norm.contains("download") {
        let path = format!(r"{}\Downloads", user_profile);
        if std::path::Path::new(&path).exists() {
            let _ = std::process::Command::new("explorer.exe").arg(&path).spawn();
            return Ok(true);
        }
    }

    if norm.contains("doc") {
        let path = format!(r"{}\Documents", user_profile);
        if std::path::Path::new(&path).exists() {
            let _ = std::process::Command::new("explorer.exe").arg(&path).spawn();
            return Ok(true);
        }
    }

    if norm.contains("pic") || norm.contains("photo") || norm.contains("image") {
        let path = format!(r"{}\Pictures", user_profile);
        if std::path::Path::new(&path).exists() {
            let _ = std::process::Command::new("explorer.exe").arg(&path).spawn();
            return Ok(true);
        }
    }

    if norm.contains("video") || norm.contains("movie") {
        let path = format!(r"{}\Videos", user_profile);
        if std::path::Path::new(&path).exists() {
            let _ = std::process::Command::new("explorer.exe").arg(&path).spawn();
            return Ok(true);
        }
    }

    if norm.contains("desktop") {
        let path = format!(r"{}\Desktop", user_profile);
        if std::path::Path::new(&path).exists() {
            let _ = std::process::Command::new("explorer.exe").arg(&path).spawn();
            return Ok(true);
        }
    }

    if norm.contains("music") || norm.contains("song") {
        let path = format!(r"{}\Music", user_profile);
        if std::path::Path::new(&path).exists() {
            let _ = std::process::Command::new("explorer.exe").arg(&path).spawn();
            return Ok(true);
        }
    }

    // 3. Direct Local Path Check (e.g. "G:\vs code" or "C:\Program Files")
    if std::path::Path::new(clean).exists() {
        let _ = std::process::Command::new("explorer.exe").arg(clean).spawn();
        return Ok(true);
    }

    // 4. Universal Multi-Drive PowerShell Search Algorithm
    let clean_target = norm
        .replace("folder", "")
        .replace("file", "")
        .replace("open", "")
        .replace("find", "")
        .replace("show", "")
        .replace("drive", "")
        .replace("disk", "")
        .trim()
        .to_string();

    let search_key = if clean_target.is_empty() { clean.to_string() } else { clean_target };

    let ps_script = format!(
        "$t = '{search_key}'; $drives = (Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root); $paths = @($drives) + @('$env:USERPROFILE\\Desktop', '$env:USERPROFILE\\Documents', '$env:USERPROFILE\\Downloads', '$env:USERPROFILE\\Pictures', '$env:USERPROFILE\\Videos'); $f = Get-ChildItem -Path $paths -Directory -Recurse -Depth 3 -ErrorAction SilentlyContinue | Where-Object {{ $_.Name -like \"*$t*\" }} | Select-Object -First 1; if ($f) {{ & explorer.exe $f.FullName }} else {{ $file = Get-ChildItem -Path $paths -File -Recurse -Depth 3 -ErrorAction SilentlyContinue | Where-Object {{ $_.Name -like \"*$t*\" }} | Select-Object -First 1; if ($file) {{ & explorer.exe /select, $file.FullName }} else {{ & explorer.exe '$env:USERPROFILE' }} }}"
    );

    let res = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_script])
        .spawn();

    match res {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Could not locate folder/file '{clean}': {e}")),
    }
}

#[tauri::command]
pub fn type_text_cmd(text: String) -> Result<bool, String> {
    let clean = text.trim();
    if clean.is_empty() {
        return Err("Empty text to type".into());
    }

    // 1. Send Ctrl+L to focus URL/Search bar automatically
    let _ = crate::desktop_cmds::desktop_key("Ctrl+L".into());
    std::thread::sleep(std::time::Duration::from_millis(150));

    // 2. Type out the text
    let _ = crate::desktop_cmds::desktop_type(clean.to_string());
    std::thread::sleep(std::time::Duration::from_millis(100));

    // 3. Press Enter to submit search
    let _ = crate::desktop_cmds::desktop_key("Return".into());

    Ok(true)
}
