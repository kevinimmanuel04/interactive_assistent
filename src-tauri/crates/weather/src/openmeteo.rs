//! Open-Meteo current weather. Free, no API key.

use crate::{Location, Units, WeatherError, WeatherReport};

pub async fn fetch(loc: &Location, units: Units) -> Result<WeatherReport, WeatherError> {
    let (temp_unit, wind_unit) = match units {
        Units::Metric => ("celsius", "ms"),
        Units::Imperial => ("fahrenheit", "mph"),
    };
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}\
         &current=temperature_2m,relative_humidity_2m,apparent_temperature,\
         wind_speed_10m,weather_code\
         &temperature_unit={temp_unit}&wind_speed_unit={wind_unit}",
        lat = loc.lat,
        lon = loc.lon,
    );
    let resp = reqwest::Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|e| WeatherError::Network(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(WeatherError::Provider(format!(
            "Open-Meteo HTTP {}",
            resp.status()
        )));
    }
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| WeatherError::Provider(e.to_string()))?;
    let cur = body
        .get("current")
        .ok_or_else(|| WeatherError::Provider("no `current` block".into()))?;
    let temp = cur
        .get("temperature_2m")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| WeatherError::Provider("no temperature_2m".into()))?;
    let feels = cur.get("apparent_temperature").and_then(|v| v.as_f64());
    let humidity = cur.get("relative_humidity_2m").and_then(|v| v.as_f64());
    let wind = cur.get("wind_speed_10m").and_then(|v| v.as_f64());
    let code = cur
        .get("weather_code")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let (desc, icon) = wmo_describe(code);
    Ok(WeatherReport {
        location: loc.clone(),
        provider: "openmeteo".into(),
        temperature: temp,
        feels_like: feels,
        humidity,
        wind_speed: wind,
        description: desc.into(),
        icon: icon.into(),
        units: match units {
            Units::Metric => "metric",
            Units::Imperial => "imperial",
        }
        .into(),
    })
}

/// WMO weather interpretation codes →
/// (Russian description, emoji). See open-meteo.com/en/docs.
fn wmo_describe(code: i64) -> (&'static str, &'static str) {
    match code {
        0 => ("ясно", "☀️"),
        1 => ("преимущественно ясно", "🌤️"),
        2 => ("переменная облачность", "⛅"),
        3 => ("пасмурно", "☁️"),
        45 | 48 => ("туман", "🌫️"),
        51..=55 => ("морось", "🌦️"),
        56 | 57 => ("ледяная морось", "🌧️"),
        61..=65 => ("дождь", "🌧️"),
        66 | 67 => ("ледяной дождь", "🌧️"),
        71..=75 => ("снег", "🌨️"),
        77 => ("снежная крупа", "🌨️"),
        80..=82 => ("ливень", "🌧️"),
        85 | 86 => ("снегопад", "❄️"),
        95 => ("гроза", "⛈️"),
        96 | 99 => ("гроза с градом", "⛈️"),
        _ => ("неизвестные условия", "🌡️"),
    }
}
