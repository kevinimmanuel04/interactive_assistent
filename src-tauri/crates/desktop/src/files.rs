//! Safe file operations for the assistant.
//!
//! Writes are constrained to a user-specified "workspace" directory to
//! prevent accidental (or adversarial) access to arbitrary paths. Reads
//! follow the same rule. The workspace root is provided by the host
//! (Tauri command layer) and defaults to the user's Documents directory.

use crate::DesktopError;
use std::path::{Path, PathBuf};

fn ensure_in_root(root: &Path, target: &Path) -> Result<PathBuf, DesktopError> {
    let canon_root = root
        .canonicalize()
        .map_err(|e| DesktopError::Forbidden(format!("root: {e}")))?;
    // We can't canonicalize a not-yet-existing path; resolve the parent.
    let probe: Result<PathBuf, DesktopError> = if target.exists() {
        target
            .canonicalize()
            .map_err(|e| DesktopError::Forbidden(e.to_string()))
    } else {
        let parent = target
            .parent()
            .ok_or_else(|| DesktopError::Forbidden("target has no parent".into()))?;
        let canon_parent = parent
            .canonicalize()
            .map_err(|e| DesktopError::Forbidden(e.to_string()))?;
        Ok(canon_parent.join(target.file_name().unwrap_or_default()))
    };
    let resolved = probe?;
    if !resolved.starts_with(&canon_root) {
        return Err(DesktopError::Forbidden(format!(
            "{} is outside workspace",
            resolved.display()
        )));
    }
    Ok(resolved)
}

pub fn write_file(root: &Path, rel: &str, contents: &[u8]) -> Result<PathBuf, DesktopError> {
    let target = root.join(rel);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let checked = ensure_in_root(root, &target)?;
    std::fs::write(&checked, contents)?;
    Ok(checked)
}

pub fn read_file(root: &Path, rel: &str) -> Result<Vec<u8>, DesktopError> {
    let target = root.join(rel);
    let checked = ensure_in_root(root, &target)?;
    Ok(std::fs::read(&checked)?)
}

pub fn list_dir(root: &Path, rel: &str) -> Result<Vec<String>, DesktopError> {
    let target = if rel.is_empty() {
        root.to_path_buf()
    } else {
        root.join(rel)
    };
    let checked = ensure_in_root(root, &target)?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&checked)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let kind = if entry.file_type()?.is_dir() { "/" } else { "" };
        out.push(format!("{name}{kind}"));
    }
    out.sort();
    Ok(out)
}
