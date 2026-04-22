//! Machine + environment context exposed to the assistant.
//!
//! We collect a snapshot of cheap, privacy-bounded facts (OS, CPU, RAM,
//! GPUs, current time/date in the user's timezone) and render them as a
//! short system message that gets prepended to every prompt. Heavy or
//! sensitive data (processes, disks, network) is deliberately omitted —
//! add a dedicated skill if the user wants to query them.

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::time::{Duration, Instant};
use sysinfo::System;

/// What the LLM sees as context. Regenerated at most once per
/// `STATIC_TTL`; time/date is always fresh because we render it at render
/// time, not when the snapshot is built.
#[derive(Debug, Clone)]
pub struct SystemSnapshot {
    pub os_long: String,
    pub cpu_brand: String,
    pub cpu_cores: usize,
    pub total_memory_gb: f64,
    pub gpus: Vec<String>,
    pub hostname: String,
}

static CACHE: Lazy<Mutex<Option<(Instant, SystemSnapshot)>>> = Lazy::new(|| Mutex::new(None));
const STATIC_TTL: Duration = Duration::from_secs(300);

pub fn snapshot() -> SystemSnapshot {
    {
        let guard = CACHE.lock();
        if let Some((at, snap)) = guard.as_ref() {
            if at.elapsed() < STATIC_TTL {
                return snap.clone();
            }
        }
    }
    let fresh = build_snapshot();
    *CACHE.lock() = Some((Instant::now(), fresh.clone()));
    fresh
}

fn build_snapshot() -> SystemSnapshot {
    let mut sys = System::new_all();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let os_long = format!(
        "{} {} ({})",
        System::name().unwrap_or_else(|| "Unknown OS".into()),
        System::os_version().unwrap_or_default(),
        System::kernel_version().unwrap_or_default(),
    );
    let cpu_brand = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_default();
    let cpu_cores = System::physical_core_count().unwrap_or_else(|| sys.cpus().len());
    let total_memory_gb = (sys.total_memory() as f64) / 1_073_741_824.0;
    let hostname = System::host_name().unwrap_or_default();
    let gpus = detect_gpus();
    SystemSnapshot {
        os_long,
        cpu_brand,
        cpu_cores,
        total_memory_gb,
        gpus,
        hostname,
    }
}

/// Best-effort GPU enumeration. On Windows we use `wmic` / PowerShell;
/// on Linux we shell out to `lspci`. Failures just return an empty list.
fn detect_gpus() -> Vec<String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        // PowerShell is more reliable than wmic on Win11 (wmic is deprecated).
        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
        ]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        if let Ok(out) = cmd.output() {
            if out.status.success() {
                return String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        if let Ok(out) = Command::new("lspci").output() {
            if out.status.success() {
                return String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .filter(|l| l.contains("VGA") || l.contains("3D") || l.contains("Display"))
                    .map(|l| l.split(':').nth(2).unwrap_or(l).trim().to_string())
                    .collect();
            }
        }
    }
    Vec::new()
}

/// True when at least one detected GPU looks like an NVIDIA card —
/// used to pick a sensible default for local-LLM GPU offload.
pub fn has_nvidia_gpu() -> bool {
    snapshot().gpus.iter().any(|g| {
        g.to_lowercase().contains("nvidia")
            || g.to_lowercase().contains("geforce")
            || g.to_lowercase().contains("rtx")
            || g.to_lowercase().contains("gtx")
    })
}

/// Render the system + time context as a short markdown bullet list
/// suitable for a `system` role message. Language-agnostic — the LLM
/// will translate naturally when replying.
pub fn render_context_message() -> String {
    let snap = snapshot();
    let now = chrono::Local::now();
    let date = now.format("%A, %B %-d, %Y").to_string();
    let time = now.format("%H:%M").to_string();
    let tz = iana_time_zone::get_timezone().unwrap_or_else(|_| now.offset().to_string());

    let mut out = String::from("User environment (facts you may reference if relevant):\n");
    out.push_str(&format!("- current date: {date}\n"));
    out.push_str(&format!("- current time: {time} ({tz})\n"));
    out.push_str(&format!("- OS: {}\n", snap.os_long));
    if !snap.cpu_brand.is_empty() {
        out.push_str(&format!(
            "- CPU: {} ({} cores)\n",
            snap.cpu_brand, snap.cpu_cores
        ));
    }
    if snap.total_memory_gb > 0.0 {
        out.push_str(&format!("- RAM: {:.1} GB\n", snap.total_memory_gb));
    }
    if !snap.gpus.is_empty() {
        out.push_str(&format!("- GPU(s): {}\n", snap.gpus.join(", ")));
    }
    if !snap.hostname.is_empty() {
        out.push_str(&format!("- hostname: {}\n", snap.hostname));
    }
    out.push_str("Use these only when the user asks; do not proactively reveal them.");
    out
}
