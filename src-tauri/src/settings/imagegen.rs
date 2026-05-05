//! Image-generation settings shared by all imagegen providers
//! (OpenRouter image, Replicate, local sd.cpp).

use super::defaults::{
    DEFAULT_IMAGEGEN_DEVICE, DEFAULT_IMAGEGEN_HEIGHT, DEFAULT_IMAGEGEN_OR_MODEL,
    DEFAULT_IMAGEGEN_PROVIDER, DEFAULT_IMAGEGEN_REPLICATE_MODEL, DEFAULT_IMAGEGEN_STEPS,
    DEFAULT_IMAGEGEN_WIDTH,
};
use super::store::{get_i64, read_string, write_i64, write_optional_string};
use super::Result;
use tauri::{AppHandle, Runtime, Wry};

const KEY_IMAGEGEN_PROVIDER: &str = "imagegen_provider";
const KEY_IMAGEGEN_OR_MODEL: &str = "imagegen_openrouter_model";
const KEY_IMAGEGEN_REPLICATE_MODEL: &str = "imagegen_replicate_model";
const KEY_IMAGEGEN_LOCAL_BINARY: &str = "imagegen_local_binary";
const KEY_IMAGEGEN_LOCAL_MODEL: &str = "imagegen_local_model";
const KEY_IMAGEGEN_DEVICE: &str = "imagegen_device";
const KEY_IMAGEGEN_WIDTH: &str = "imagegen_width";
const KEY_IMAGEGEN_HEIGHT: &str = "imagegen_height";
const KEY_IMAGEGEN_STEPS: &str = "imagegen_steps";
const KEY_IMAGEGEN_NEGATIVE: &str = "imagegen_negative_prompt";

pub fn get_imagegen_provider(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_IMAGEGEN_PROVIDER).unwrap_or_else(|| DEFAULT_IMAGEGEN_PROVIDER.to_string())
}
pub fn set_imagegen_provider<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_IMAGEGEN_PROVIDER, v)
}

pub fn get_imagegen_openrouter_model(app: &AppHandle<Wry>) -> String {
    let v = read_string(app, KEY_IMAGEGEN_OR_MODEL)
        .unwrap_or_else(|| DEFAULT_IMAGEGEN_OR_MODEL.to_string());
    // Migration: OpenRouter renamed/removed the `-preview` alias for
    // gemini-2.5-flash-image (it now 404s). Auto-rewrite to the GA name
    // so existing installs don't keep failing.
    if v == "google/gemini-2.5-flash-image-preview" {
        return DEFAULT_IMAGEGEN_OR_MODEL.to_string();
    }
    v
}
pub fn set_imagegen_openrouter_model<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_IMAGEGEN_OR_MODEL, v)
}

pub fn get_imagegen_replicate_model(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_IMAGEGEN_REPLICATE_MODEL)
        .unwrap_or_else(|| DEFAULT_IMAGEGEN_REPLICATE_MODEL.to_string())
}
pub fn set_imagegen_replicate_model<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_IMAGEGEN_REPLICATE_MODEL, v)
}

pub fn get_imagegen_local_binary(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_IMAGEGEN_LOCAL_BINARY)
}
pub fn set_imagegen_local_binary<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_IMAGEGEN_LOCAL_BINARY, v)
}

pub fn get_imagegen_local_model(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_IMAGEGEN_LOCAL_MODEL)
}
pub fn set_imagegen_local_model<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_IMAGEGEN_LOCAL_MODEL, v)
}

pub fn get_imagegen_device(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_IMAGEGEN_DEVICE).unwrap_or_else(|| DEFAULT_IMAGEGEN_DEVICE.to_string())
}
pub fn set_imagegen_device<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_IMAGEGEN_DEVICE, v)
}

pub fn set_imagegen_size<R: Runtime>(app: &AppHandle<R>, w: i64, h: i64) -> Result<()> {
    write_i64(app, KEY_IMAGEGEN_WIDTH, w.clamp(64, 4096))?;
    write_i64(app, KEY_IMAGEGEN_HEIGHT, h.clamp(64, 4096))?;
    Ok(())
}

pub fn set_imagegen_steps<R: Runtime>(app: &AppHandle<R>, n: i64) -> Result<()> {
    write_i64(app, KEY_IMAGEGEN_STEPS, n.clamp(1, 200))
}

pub fn set_imagegen_negative_prompt<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_IMAGEGEN_NEGATIVE, v)
}

pub fn get_imagegen_width(app: &AppHandle<Wry>) -> i64 {
    get_i64(app, KEY_IMAGEGEN_WIDTH).unwrap_or(DEFAULT_IMAGEGEN_WIDTH)
}

pub fn get_imagegen_height(app: &AppHandle<Wry>) -> i64 {
    get_i64(app, KEY_IMAGEGEN_HEIGHT).unwrap_or(DEFAULT_IMAGEGEN_HEIGHT)
}

pub fn get_imagegen_steps(app: &AppHandle<Wry>) -> i64 {
    get_i64(app, KEY_IMAGEGEN_STEPS).unwrap_or(DEFAULT_IMAGEGEN_STEPS)
}

pub fn get_imagegen_negative_prompt(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_IMAGEGEN_NEGATIVE)
}
