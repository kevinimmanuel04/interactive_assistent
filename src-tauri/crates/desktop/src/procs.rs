//! Process enumeration + active-window detection.

use crate::{AppKind, DesktopError};
use serde::Serialize;
use sysinfo::System;

#[derive(Debug, Clone, Serialize)]
pub struct ProcInfo {
    pub pid: u32,
    pub name: String,
    pub cpu: f32,
    pub memory_mb: u64,
    pub kind: AppKind,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActiveWindow {
    pub title: String,
    pub process_name: String,
    pub pid: u32,
    pub kind: AppKind,
    pub is_fullscreen: bool,
}

/// Snapshot of the top N processes by CPU use, with lightweight classification.
pub fn top_processes(limit: usize) -> Result<Vec<ProcInfo>, DesktopError> {
    let mut sys = System::new_all();
    // Two refreshes so CPU deltas are meaningful.
    sys.refresh_all();
    std::thread::sleep(std::time::Duration::from_millis(120));
    sys.refresh_cpu_usage();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut procs: Vec<ProcInfo> = sys
        .processes()
        .iter()
        .map(|(pid, p)| {
            let name = p.name().to_string_lossy().into_owned();
            ProcInfo {
                pid: pid.as_u32(),
                name: name.clone(),
                cpu: p.cpu_usage(),
                memory_mb: p.memory() / (1024 * 1024),
                kind: AppKind::classify(&name),
            }
        })
        .collect();
    procs.sort_by(|a, b| {
        b.cpu
            .partial_cmp(&a.cpu)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    procs.truncate(limit);
    Ok(procs)
}

/// Return the foreground window's title + owning process (best-effort).
/// Currently only implemented on Windows; on other platforms returns None.
pub fn active_window() -> Option<ActiveWindow> {
    #[cfg(windows)]
    {
        use winapi::um::processthreadsapi::OpenProcess;
        use winapi::um::winuser::{
            GetForegroundWindow, GetWindowLongW, GetWindowRect, GetWindowTextLengthW,
            GetWindowTextW, GetWindowThreadProcessId, GWL_STYLE, WS_POPUP,
        };
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() {
                return None;
            }
            let len = GetWindowTextLengthW(hwnd);
            let mut buf: Vec<u16> = vec![0; (len + 1) as usize];
            GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
            let title = String::from_utf16_lossy(&buf[..len as usize]);

            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);

            let mut rect = std::mem::zeroed::<winapi::shared::windef::RECT>();
            let _ = GetWindowRect(hwnd, &mut rect);
            let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
            let is_borderless = (style & WS_POPUP) != 0;
            // Heuristic: the window covers the primary monitor.
            let (sw, sh) = (
                winapi::um::winuser::GetSystemMetrics(winapi::um::winuser::SM_CXSCREEN),
                winapi::um::winuser::GetSystemMetrics(winapi::um::winuser::SM_CYSCREEN),
            );
            let covers_screen = (rect.right - rect.left) >= sw && (rect.bottom - rect.top) >= sh;
            let is_fullscreen = is_borderless && covers_screen;

            // Resolve process name by scanning sysinfo once (cheap).
            let mut sys = System::new();
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            let p = sys.process(sysinfo::Pid::from_u32(pid));
            let process_name = p
                .map(|p| p.name().to_string_lossy().into_owned())
                .unwrap_or_default();
            let kind = AppKind::classify(&process_name);

            // Close the implicit handle from OpenProcess if we opened one (we didn't here).
            let _ = OpenProcess;

            Some(ActiveWindow {
                title,
                process_name,
                pid,
                kind,
                is_fullscreen,
            })
        }
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// Convenience: is any running process classified as a Game?
pub fn is_gaming() -> bool {
    top_processes(20)
        .map(|ps| ps.iter().any(|p| p.kind == AppKind::Game && p.cpu > 1.0))
        .unwrap_or(false)
}
