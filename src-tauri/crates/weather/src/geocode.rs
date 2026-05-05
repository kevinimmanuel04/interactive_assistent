//! Free Open-Meteo geocoding. No API key required.

use crate::extract::strip_ru_inflection;
use crate::{Location, WeatherError};

const ENDPOINT: &str = "https://geocoding-api.open-meteo.com/v1/search";

/// Resolve `city` to coordinates. Tries the literal form first; if there
/// are no results, falls back to a stripped-inflection form (e.g.
/// "Берлине" → "Берлин"). Both errors and ok-but-empty produce a single
/// final `WeatherError::Location`.
pub async fn geocode(city: &str) -> Result<Location, WeatherError> {
    match try_geocode(city).await {
        Ok(loc) => Ok(loc),
        Err(WeatherError::Location(_)) => {
            if let Some(stripped) = strip_ru_inflection(city) {
                if stripped != city {
                    if let Ok(loc) = try_geocode(&stripped).await {
                        return Ok(loc);
                    }
                }
            }
            Err(WeatherError::Location(format!("no results for '{city}'")))
        }
        Err(e) => Err(e),
    }
}

async fn try_geocode(city: &str) -> Result<Location, WeatherError> {
    let url = format!(
        "{ENDPOINT}?name={}&count=1&language=en&format=json",
        urlencoding(city)
    );
    let resp = reqwest::Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|e| WeatherError::Network(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(WeatherError::Provider(format!(
            "geocoding HTTP {}",
            resp.status()
        )));
    }
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| WeatherError::Provider(e.to_string()))?;
    let first = body
        .get("results")
        .and_then(|a| a.as_array())
        .and_then(|a| a.first())
        .ok_or_else(|| WeatherError::Location(format!("no results for '{city}'")))?;
    let name = first
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(city)
        .to_string();
    let country = first
        .get("country")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let lat = first
        .get("latitude")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| WeatherError::Provider("no latitude in geocode".into()))?;
    let lon = first
        .get("longitude")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| WeatherError::Provider("no longitude in geocode".into()))?;
    Ok(Location {
        name,
        country,
        lat,
        lon,
    })
}

/// Minimal percent-encoder for query params (avoids pulling another dep).
fn urlencoding(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}
