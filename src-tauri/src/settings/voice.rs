//! Voice-input configuration: audio devices, wake word, listen-mode
//! toggles, and the various STT backends (local Whisper, faster-whisper
//! sidecar, Deepgram, OpenRouter STT).

use super::defaults::{
    DEFAULT_DEEPGRAM_MODEL, DEFAULT_FASTER_WHISPER_MODEL, DEFAULT_FASTER_WHISPER_URL,
    DEFAULT_OPENROUTER_STT_MODEL,
};
use super::store::{get_bool, read_string, write_bool, write_optional_string};
use super::Result;
use tauri::{AppHandle, Runtime, Wry};

const KEY_AUDIO_INPUT: &str = "audio_input_device";
const KEY_AUDIO_OUTPUT: &str = "audio_output_device";
const KEY_WHISPER_MODEL_PATH: &str = "whisper_model_path";
const KEY_WAKE_WORD: &str = "wake_word";
const KEY_LISTEN_ENABLED: &str = "listen_enabled";
const KEY_AUTO_LISTEN: &str = "auto_listen";

const KEY_OPENROUTER_STT_ENABLED: &str = "openrouter_stt_enabled";
const KEY_OPENROUTER_STT_MODEL: &str = "openrouter_stt_model";

const KEY_FASTER_WHISPER_ENABLED: &str = "faster_whisper_enabled";
const KEY_FASTER_WHISPER_URL: &str = "faster_whisper_url";
const KEY_FASTER_WHISPER_MODEL: &str = "faster_whisper_model";
const KEY_FASTER_WHISPER_LANGUAGE: &str = "faster_whisper_language";

const KEY_DEEPGRAM_ENABLED: &str = "deepgram_enabled";
const KEY_DEEPGRAM_MODEL: &str = "deepgram_model";
const KEY_DEEPGRAM_LANGUAGE: &str = "deepgram_language";

// --- Audio devices --------------------------------------------------------

pub fn get_audio_input(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_AUDIO_INPUT)
}

pub fn set_audio_input<R: Runtime>(app: &AppHandle<R>, name: &str) -> Result<()> {
    write_optional_string(app, KEY_AUDIO_INPUT, name)
}

pub fn read_audio_output(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_AUDIO_OUTPUT)
}

pub fn set_audio_output<R: Runtime>(app: &AppHandle<R>, name: &str) -> Result<()> {
    write_optional_string(app, KEY_AUDIO_OUTPUT, name)
}

// --- Wake word + listen toggles ------------------------------------------

pub fn read_wake_word(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_WAKE_WORD)
}

pub fn set_wake_word<R: Runtime>(app: &AppHandle<R>, phrase: &str) -> Result<()> {
    write_optional_string(app, KEY_WAKE_WORD, phrase)
}

pub fn get_listen_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_LISTEN_ENABLED, false)
}

pub fn set_listen_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_LISTEN_ENABLED, on)
}

pub fn get_auto_listen(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_AUTO_LISTEN, false)
}

pub fn set_auto_listen<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_AUTO_LISTEN, on)
}

// --- Local Whisper --------------------------------------------------------

pub fn get_whisper_model_path(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_WHISPER_MODEL_PATH)
}

pub fn set_whisper_model_path<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<()> {
    write_optional_string(app, KEY_WHISPER_MODEL_PATH, path)
}

// --- OpenRouter STT -------------------------------------------------------

pub fn get_openrouter_stt_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_OPENROUTER_STT_ENABLED, false)
}

pub fn set_openrouter_stt_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_OPENROUTER_STT_ENABLED, on)
}

pub fn get_openrouter_stt_model(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_OPENROUTER_STT_MODEL)
        .unwrap_or_else(|| DEFAULT_OPENROUTER_STT_MODEL.to_string())
}

pub fn set_openrouter_stt_model<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_OPENROUTER_STT_MODEL, v)
}

// --- Faster-Whisper sidecar ----------------------------------------------

pub fn get_faster_whisper_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_FASTER_WHISPER_ENABLED, false)
}

pub fn set_faster_whisper_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_FASTER_WHISPER_ENABLED, on)
}

pub fn get_faster_whisper_url(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_FASTER_WHISPER_URL)
        .unwrap_or_else(|| DEFAULT_FASTER_WHISPER_URL.to_string())
}

pub fn set_faster_whisper_url<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_FASTER_WHISPER_URL, v)
}

pub fn get_faster_whisper_model(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_FASTER_WHISPER_MODEL)
        .unwrap_or_else(|| DEFAULT_FASTER_WHISPER_MODEL.to_string())
}

pub fn set_faster_whisper_model<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_FASTER_WHISPER_MODEL, v)
}

pub fn get_faster_whisper_language(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_FASTER_WHISPER_LANGUAGE)
}

pub fn set_faster_whisper_language<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_FASTER_WHISPER_LANGUAGE, v)
}

// --- Deepgram -------------------------------------------------------------

pub fn get_deepgram_enabled(app: &AppHandle<Wry>) -> bool {
    get_bool(app, KEY_DEEPGRAM_ENABLED, false)
}

pub fn set_deepgram_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<()> {
    write_bool(app, KEY_DEEPGRAM_ENABLED, on)
}

pub fn get_deepgram_model(app: &AppHandle<Wry>) -> String {
    read_string(app, KEY_DEEPGRAM_MODEL).unwrap_or_else(|| DEFAULT_DEEPGRAM_MODEL.to_string())
}

pub fn set_deepgram_model<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_DEEPGRAM_MODEL, v)
}

pub fn get_deepgram_language(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_DEEPGRAM_LANGUAGE)
}

pub fn set_deepgram_language<R: Runtime>(app: &AppHandle<R>, v: &str) -> Result<()> {
    write_optional_string(app, KEY_DEEPGRAM_LANGUAGE, v)
}
