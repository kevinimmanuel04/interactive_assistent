//! API keys for cloud providers. All read+write through the same
//! "trim, empty deletes" convention via [`store::write_secret`].

use super::store::{read_string, write_secret};
use super::Result;
use tauri::{AppHandle, Runtime, Wry};

const KEY_OPENROUTER_API: &str = "openrouter_api_key";
const KEY_DEEPGRAM_API: &str = "deepgram_api_key";
const KEY_REPLICATE_API: &str = "replicate_api_token";
const KEY_WEATHER_API_KEY: &str = "weather_api_key";

pub fn get_openrouter_key(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_OPENROUTER_API)
}

pub fn set_openrouter_key<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<()> {
    write_secret(app, KEY_OPENROUTER_API, key)
}

pub fn get_deepgram_key(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_DEEPGRAM_API)
}

pub fn set_deepgram_key<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<()> {
    write_secret(app, KEY_DEEPGRAM_API, key)
}

pub fn get_replicate_token(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_REPLICATE_API)
}

pub fn set_replicate_token<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<()> {
    write_secret(app, KEY_REPLICATE_API, key)
}

pub fn get_weather_api_key(app: &AppHandle<Wry>) -> Option<String> {
    read_string(app, KEY_WEATHER_API_KEY)
}

pub fn set_weather_api_key<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<()> {
    write_secret(app, KEY_WEATHER_API_KEY, key)
}
