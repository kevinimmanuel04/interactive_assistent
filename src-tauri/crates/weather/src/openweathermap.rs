//! OpenWeatherMap current weather. Requires a free API key.

use crate::{Location, Units, WeatherError, WeatherReport};

pub async fn fetch(
    loc: &Location,
    units: Units,
    api_key: &str,
) -> Result<WeatherReport, WeatherError> {
    let units_str = match units {
        Units::Metric => "metric",
        Units::Imperial => "imperial",
    };
    let url = format!(
        "https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}\
         &appid={key}&units={units_str}&lang=ru",
        lat = loc.lat,
        lon = loc.lon,
        key = api_key,
    );
    let resp = reqwest::Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|e| WeatherError::Network(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(WeatherError::Provider(format!(
            "OpenWeatherMap HTTP {}",
            resp.status()
        )));
    }
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| WeatherError::Provider(e.to_string()))?;
    let main = body
        .get("main")
        .ok_or_else(|| WeatherError::Provider("no `main` block".into()))?;
    let temp = main
        .get("temp")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| WeatherError::Provider("no temp".into()))?;
    let feels = main.get("feels_like").and_then(|v| v.as_f64());
    let humidity = main.get("humidity").and_then(|v| v.as_f64());
    let wind = body
        .get("wind")
        .and_then(|w| w.get("speed"))
        .and_then(|v| v.as_f64());
    let weather = body
        .get("weather")
        .and_then(|a| a.as_array())
        .and_then(|a| a.first());
    let desc = weather
        .and_then(|w| w.get("description"))
        .and_then(|v| v.as_str())
        .unwrap_or("неизвестно")
        .to_string();
    let icon_id = weather
        .and_then(|w| w.get("icon"))
        .and_then(|v| v.as_str())
        .unwrap_or("01d");
    Ok(WeatherReport {
        location: loc.clone(),
        provider: "openweathermap".into(),
        temperature: temp,
        feels_like: feels,
        humidity,
        wind_speed: wind,
        description: desc,
        icon: owm_icon(icon_id).into(),
        units: units_str.into(),
    })
}

fn owm_icon(id: &str) -> &'static str {
    match id {
        "01d" | "01n" => "☀️",
        "02d" | "02n" => "🌤️",
        "03d" | "03n" => "⛅",
        "04d" | "04n" => "☁️",
        "09d" | "09n" => "🌧️",
        "10d" | "10n" => "🌦️",
        "11d" | "11n" => "⛈️",
        "13d" | "13n" => "❄️",
        "50d" | "50n" => "🌫️",
        _ => "🌡️",
    }
}
