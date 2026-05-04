//! Shared helpers used by multiple command modules.

/// Lightweight id generator (avoids pulling in the `uuid` crate just for UX).
pub(crate) fn uuid_like() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("msg-{nanos:x}")
}
