//! Phase 2 stub: local personality LoRA training.
//!
//! These keys are wired through the public snapshot so the UI can
//! expose them, but the actual sidecar trainer is delivered in a
//! follow-up.

use super::store::{get_bool, write_bool, write_i64, write_optional_string};
use super::Result;
use tauri::{AppHandle, Runtime, Wry};

const KEY_TRAINING_ENABLED: &str = "training_enabled";
const KEY_TRAINING_MAX_CPU_PCT: &str = "training_max_cpu_pct";
const KEY_TRAINING_BATTERY_FLOOR_PCT: &str = "training_battery_floor_pct";
const KEY_TRAINING_MIN_EXAMPLES: &str = "training_min_examples";
const KEY_TRAINING_SCHEDULE: &str = "training_schedule";

pub fn get_training_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_TRAINING_ENABLED, false)
}

pub fn set_training_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_TRAINING_ENABLED, on)
}

pub fn set_training_max_cpu_pct<R: Runtime>(app: &AppHandle<R>, pct: i64) -> Result<()> {
    let clamped = pct.clamp(1, 95);
    write_i64(app, KEY_TRAINING_MAX_CPU_PCT, clamped)
}

pub fn set_training_battery_floor_pct<R: Runtime>(app: &AppHandle<R>, pct: i64) -> Result<()> {
    let clamped = pct.clamp(0, 100);
    write_i64(app, KEY_TRAINING_BATTERY_FLOOR_PCT, clamped)
}

pub fn set_training_min_examples<R: Runtime>(app: &AppHandle<R>, n: i64) -> Result<()> {
    let clamped = n.clamp(10, 100_000);
    write_i64(app, KEY_TRAINING_MIN_EXAMPLES, clamped)
}

pub fn set_training_schedule<R: Runtime>(app: &AppHandle<R>, schedule: &str) -> Result<()> {
    let v = match schedule {
        "manual" | "idle" | "scheduled" => schedule,
        _ => "manual",
    };
    write_optional_string(app, KEY_TRAINING_SCHEDULE, v)
}

// --- Internal keys re-exposed for the snapshot reader --------------------
//
// `public_snapshot` reads training fields directly to avoid an extra
// allocation per refresh. These string consts let it use the same key
// names without duplicating them.
pub(super) const KEY_MAX_CPU: &str = KEY_TRAINING_MAX_CPU_PCT;
pub(super) const KEY_BATTERY_FLOOR: &str = KEY_TRAINING_BATTERY_FLOOR_PCT;
pub(super) const KEY_MIN_EXAMPLES: &str = KEY_TRAINING_MIN_EXAMPLES;
pub(super) const KEY_SCHEDULE: &str = KEY_TRAINING_SCHEDULE;
