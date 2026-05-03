//! Weather lookup. Two providers, free geocoding via Open-Meteo, optional
//! IP-based location, and pattern-based city extraction from chat text.
//!
//! Public entry points:
//! * [`fetch`] — orchestrate location + provider into a [`WeatherReport`].
//! * [`extract_city_from_text`] — pull a city out of "погода в Берлине" /
//!   "weather in Berlin" style phrases.
//! * [`is_weather_query`] — keyword detector for chat auto-routing.
//! * [`format_report`] — human-readable rendering for chat replies.

mod extract;
mod geocode;
mod ip;
mod openmeteo;
mod openweathermap;

pub use extract::{extract_city_from_text, is_weather_query};

use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum WeatherError {
    #[error("missing API key for {0}")]
    MissingKey(&'static str),
    #[error("could not resolve location: {0}")]
    Location(String),
    #[error("provider error: {0}")]
    Provider(String),
    #[error("network error: {0}")]
    Network(String),
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    OpenWeatherMap,
    OpenMeteo,
}

impl Provider {
    pub fn parse(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "openweathermap" | "owm" => Provider::OpenWeatherMap,
            _ => Provider::OpenMeteo,
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Provider::OpenWeatherMap => "openweathermap",
            Provider::OpenMeteo => "openmeteo",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Units {
    Metric,
    Imperial,
}

impl Units {
    pub fn parse(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "imperial" | "f" | "fahrenheit" => Units::Imperial,
            _ => Units::Metric,
        }
    }
    pub fn temp_suffix(self) -> &'static str {
        match self {
            Units::Metric => "°C",
            Units::Imperial => "°F",
        }
    }
    pub fn wind_suffix(self) -> &'static str {
        match self {
            Units::Metric => "м/с",
            Units::Imperial => "mph",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Location {
    pub name: String,
    pub country: Option<String>,
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct WeatherReport {
    pub location: Location,
    pub provider: String,
    pub temperature: f64,
    pub feels_like: Option<f64>,
    pub humidity: Option<f64>,
    pub wind_speed: Option<f64>,
    pub description: String,
    pub icon: String,
    pub units: String,
}

#[derive(Debug, Clone, Default)]
pub struct WeatherConfig {
    pub provider: Option<Provider>,
    pub api_key: Option<String>,
    pub default_city: Option<String>,
    pub use_ip: bool,
    pub units: Option<Units>,
}

/// Resolve a [`Location`] given an optional explicit city. Falls back to
/// `default_city` from config, then optional IP geolocation.
pub async fn resolve_location(
    cfg: &WeatherConfig,
    explicit_city: Option<&str>,
) -> Result<Location, WeatherError> {
    if let Some(c) = explicit_city.and_then(|s| {
        let t = s.trim();
        if t.is_empty() {
            None
        } else {
            Some(t)
        }
    }) {
        return geocode::geocode(c).await;
    }
    if let Some(c) = cfg.default_city.as_deref().and_then(|s| {
        let t = s.trim();
        if t.is_empty() {
            None
        } else {
            Some(t)
        }
    }) {
        return geocode::geocode(c).await;
    }
    if cfg.use_ip {
        return ip::ip_geo().await;
    }
    Err(WeatherError::Location(
        "no city provided and IP geolocation is disabled".into(),
    ))
}

/// Top-level fetch: resolves location, queries the configured provider,
/// returns a normalized [`WeatherReport`].
pub async fn fetch(
    cfg: &WeatherConfig,
    explicit_city: Option<&str>,
) -> Result<WeatherReport, WeatherError> {
    let location = resolve_location(cfg, explicit_city).await?;
    let provider = cfg.provider.unwrap_or(Provider::OpenMeteo);
    let units = cfg.units.unwrap_or(Units::Metric);
    match provider {
        Provider::OpenMeteo => openmeteo::fetch(&location, units).await,
        Provider::OpenWeatherMap => {
            let key = cfg
                .api_key
                .as_deref()
                .filter(|k| !k.trim().is_empty())
                .ok_or(WeatherError::MissingKey("openweathermap"))?;
            openweathermap::fetch(&location, units, key).await
        }
    }
}

/// One-line + emoji rendering used in chat replies. Bilingual-friendly.
pub fn format_report(r: &WeatherReport) -> String {
    let loc = match &r.location.country {
        Some(c) if !c.is_empty() => format!("{}, {}", r.location.name, c),
        _ => r.location.name.clone(),
    };
    let units = Units::parse(&r.units);
    let temp = format!("{:.0}{}", r.temperature, units.temp_suffix());
    let feels = r
        .feels_like
        .map(|v| format!(" (ощущается {:.0}{})", v, units.temp_suffix()))
        .unwrap_or_default();
    let wind = r
        .wind_speed
        .map(|v| format!(", ветер {:.1} {}", v, units.wind_suffix()))
        .unwrap_or_default();
    let humidity = r
        .humidity
        .map(|v| format!(", влажность {:.0}%", v))
        .unwrap_or_default();
    format!(
        "{} в {}: {} — {}{}{}{}",
        r.icon, loc, temp, r.description, feels, wind, humidity
    )
}
