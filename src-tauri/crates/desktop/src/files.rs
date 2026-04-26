//! File operations for the assistant.
//!
//! As of v1.1, the workspace "sandbox" is informational only — the
//! `root` argument is treated as a hint for relative-path resolution,
//! but absolute paths are accepted and operations may target any
//! location the OS allows. The user explicitly opted into desktop
//! automation; restricting them to a single folder made the tool
//! useless for real workflows ("сохрани на рабочий стол" etc.).

use crate::DesktopError;
use std::path::{Path, PathBuf};

fn resolve(root: &Path, target: &str) -> PathBuf {
    let p = Path::new(target);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        root.join(p)
    }
}

pub fn write_file(root: &Path, rel: &str, contents: &[u8]) -> Result<PathBuf, DesktopError> {
    let target = resolve(root, rel);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&target, contents)?;
    Ok(target)
}

pub fn read_file(root: &Path, rel: &str) -> Result<Vec<u8>, DesktopError> {
    let target = resolve(root, rel);
    Ok(std::fs::read(&target)?)
}

pub fn list_dir(root: &Path, rel: &str) -> Result<Vec<String>, DesktopError> {
    let target = if rel.is_empty() {
        root.to_path_buf()
    } else {
        resolve(root, rel)
    };
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&target)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let kind = if entry.file_type()?.is_dir() { "/" } else { "" };
        out.push(format!("{name}{kind}"));
    }
    out.sort();
    Ok(out)
}

pub fn delete_path(target: &str) -> Result<(), DesktopError> {
    let p = Path::new(target);
    if p.is_dir() {
        std::fs::remove_dir_all(p)?;
    } else {
        std::fs::remove_file(p)?;
    }
    Ok(())
}

pub fn move_path(from: &str, to: &str) -> Result<(), DesktopError> {
    std::fs::rename(from, to)?;
    Ok(())
}
