//! Desktop automation primitives for Komorebi.
//!
//! Gives the assistant eyes (screenshots), hands (mouse + keyboard),
//! and situational awareness (running processes, active window).
//!
//! All operations are best-effort; platform-specific failures are wrapped
//! in [`DesktopError`] so callers can decide whether to surface them.
//!
//! Safety note: these primitives let the assistant control the user's
//! machine. The higher-level agent layer is responsible for asking the
//! user for confirmation before destructive actions.

use serde::{Deserialize, Serialize};

pub mod capture;
pub mod files;
pub mod input;
pub mod procs;
pub mod vdesktop;

#[derive(thiserror::Error, Debug)]
pub enum DesktopError {
    #[error("screen capture failed: {0}")]
    Capture(String),
    #[error("input simulation failed: {0}")]
    Input(String),
    #[error("process enumeration failed: {0}")]
    Proc(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("operation not allowed outside workspace: {0}")]
    Forbidden(String),
}

/// Rough application category inferred from the process name.
/// Used by the proactive agent to decide when to offer help.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppKind {
    Game,
    Ide,
    Browser,
    Office,
    Chat,
    Media,
    Terminal,
    Other,
}

impl AppKind {
    pub fn classify(name: &str) -> AppKind {
        let n = name.to_ascii_lowercase();
        // Games: known launchers + common engine executables + *.exe heuristics.
        const GAMES: &[&str] = &[
            "steam",
            "steamwebhelper",
            "epicgameslauncher",
            "gog",
            "battle.net",
            "league of legends",
            "valorant",
            "csgo",
            "cs2",
            "dota2",
            "dota 2",
            "minecraft",
            "javaw",
            "overwatch",
            "fortnite",
            "r5apex",
            "genshinimpact",
            "factorio",
            "rimworld",
            "eldenring",
            "cyberpunk2077",
            "witcher3",
            "starrail",
            "wuwa",
            "mihoyo",
        ];
        const IDES: &[&str] = &[
            "code",
            "code-insiders",
            "cursor",
            "idea64",
            "pycharm64",
            "clion64",
            "webstorm64",
            "goland64",
            "rider64",
            "rustrover64",
            "devenv",
            "sublime_text",
            "notepad++",
            "vim",
            "nvim",
            "emacs",
            "zed",
        ];
        const BROWSERS: &[&str] = &[
            "chrome", "firefox", "msedge", "brave", "opera", "vivaldi", "arc", "safari",
            "chromium", "zen",
        ];
        const OFFICE: &[&str] = &[
            "winword", "excel", "powerpnt", "onenote", "outlook", "notion", "obsidian", "anytype",
        ];
        const CHAT: &[&str] = &[
            "discord", "slack", "telegram", "whatsapp", "signal", "zoom", "teams",
        ];
        const MEDIA: &[&str] = &[
            "vlc",
            "mpc-hc",
            "mpv",
            "spotify",
            "wmplayer",
            "potplayermini",
        ];
        const TERMINAL: &[&str] = &[
            "wezterm",
            "alacritty",
            "kitty",
            "windowsterminal",
            "powershell",
            "pwsh",
            "cmd",
            "bash",
        ];
        let strip = n.trim_end_matches(".exe");
        if GAMES.iter().any(|g| strip.contains(g)) {
            return AppKind::Game;
        }
        if IDES.contains(&strip) {
            return AppKind::Ide;
        }
        if BROWSERS.contains(&strip) {
            return AppKind::Browser;
        }
        if OFFICE.contains(&strip) {
            return AppKind::Office;
        }
        if CHAT.contains(&strip) {
            return AppKind::Chat;
        }
        if MEDIA.contains(&strip) {
            return AppKind::Media;
        }
        if TERMINAL.contains(&strip) {
            return AppKind::Terminal;
        }
        AppKind::Other
    }
}
