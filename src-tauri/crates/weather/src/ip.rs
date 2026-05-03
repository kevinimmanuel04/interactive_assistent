//! IP-based geolocation. Tries ipapi.co first, falls back to ip-api.com.
//! Both are free and require no API key for low-volume usage.

use crate::{Location, WeatherError};

pub async fn ip_geo() -> Result<Location, WeatherError> {
    match ipapi_co().await {
        Ok(l) => Ok(l),
        Err(e) => {
            tracing::debug!(?e, "ipapi.co failed, trying ip-api.com");
            ip_api_com().await
        }
    }
}

async fn ipapi_co() -> Result<Location, WeatherError> {
    let resp = reqwest::Client::new()
        .get("https://ipapi.co/json/")
        .send()
        .await
        .map_err(|e| WeatherError::Network(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(WeatherError::Provider(format!(
            "ipapi.co HTTP {}",
            resp.status()
        )));
    }
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| WeatherError::Provider(e.to_string()))?;
    let lat = body
        .get("latitude")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| WeatherError::Location("ipapi.co: missing latitude".into()))?;
    let lon = body
        .get("longitude")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| WeatherError::Location("ipapi.co: missing longitude".into()))?;
    let name = body
        .get("city")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();
    let country = body
        .get("country_name")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    Ok(Location {
        name,
        country,
        lat,
        lon,
    })
}

async fn ip_api_com() -> Result<Location, WeatherError> {
    let resp = reqwest::Client::new()
        .get("http://ip-api.com/json/")
        .send()
        .await
        .map_err(|e| WeatherError::Network(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(WeatherError::Provider(format!(
            "ip-api.com HTTP {}",
            resp.status()
        )));
    }
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| WeatherError::Provider(e.to_string()))?;
    if body.get("status").and_then(|v| v.as_str()) != Some("success") {
        return Err(WeatherError::Location("ip-api.com: not success".into()));
    }
    let lat = body
        .get("lat")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| WeatherError::Location("ip-api.com: missing lat".into()))?;
    let lon = body
        .get("lon")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| WeatherError::Location("ip-api.com: missing lon".into()))?;
    let name = body
        .get("city")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();
    let country = body
        .get("country")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    Ok(Location {
        name,
        country,
        lat,
        lon,
    })
}
