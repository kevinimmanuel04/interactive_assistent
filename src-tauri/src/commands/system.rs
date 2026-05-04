//! Settings snapshot + system info commands.

use crate::settings;
use tauri::{AppHandle, Wry};

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
