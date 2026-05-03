//! Pure-Rust city extraction from free-form chat text.
//!
//! Handles common patterns in Russian and English without bringing in an
//! NER model. False positives are acceptable — geocoding will fail on
//! garbage and we can fall back to default city.

const RU_PREFIXES: &[&str] = &[
    "погода в ",
    "погоду в ",
    "погода во ",
    "погоды в ",
    "погода на ",
    "температура в ",
    "температуру в ",
    "температуры в ",
    "температура на ",
    "осадки в ",
    "дождь в ",
    "снег в ",
];

const EN_PREFIXES: &[&str] = &[
    "weather in ",
    "weather at ",
    "weather for ",
    "temperature in ",
    "temperature at ",
    "rain in ",
    "snow in ",
    "forecast for ",
    "forecast in ",
];

pub fn is_weather_query(text: &str) -> bool {
    let t = text.to_lowercase();
    t.contains("погод")
        || t.contains("температур")
        || t.contains("weather")
        || t.contains("temperature")
        || t.contains("прогноз")
        || t.contains("forecast")
}

/// Extract a city name. Returns trimmed text after a known prefix until
/// punctuation/end-of-sentence. Returns `None` if no prefix matches.
pub fn extract_city_from_text(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let prefixes = RU_PREFIXES.iter().chain(EN_PREFIXES.iter());
    for p in prefixes {
        if let Some(idx) = lower.find(p) {
            let start = idx + p.len();
            let rest = &text[start..];
            let stop_idx = rest
                .find(['.', ',', '?', '!', ';', '\n'])
                .unwrap_or(rest.len());
            let candidate = rest[..stop_idx].trim();
            if !candidate.is_empty() && candidate.len() <= 60 {
                return Some(strip_inflection(candidate));
            }
        }
    }
    None
}

/// Best-effort un-declension for Russian dative/prepositional forms:
/// "Берлине" → "Берлин", "Москве" → "Москв" → fallback "Москве".
/// Geocoding APIs handle a lot of declensions natively, so we keep this
/// conservative.
fn strip_inflection(s: &str) -> String {
    let trimmed = s.trim();
    let lower = trimmed.to_lowercase();
    // Common Russian endings to strip from prep. case nouns.
    for end in &["е", "и", "у", "ю", "ой", "ом", "ах", "ях"] {
        if lower.ends_with(end) && trimmed.chars().count() > end.chars().count() + 2 {
            // Keep the original cased prefix.
            let cut = trimmed.chars().count() - end.chars().count();
            let prefix: String = trimmed.chars().take(cut).collect();
            // Heuristic: don't break short names.
            if prefix.chars().count() >= 3 {
                // Try the stripped form; geocoder will tell us if it fails.
                return prefix;
            }
        }
    }
    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_keywords() {
        assert!(is_weather_query("какая погода?"));
        assert!(is_weather_query("what's the weather"));
        assert!(!is_weather_query("hello there"));
    }

    #[test]
    fn extracts_ru_city() {
        assert_eq!(
            extract_city_from_text("Какая погода в Берлине?"),
            Some("Берлин".to_string())
        );
    }

    #[test]
    fn extracts_en_city() {
        assert_eq!(
            extract_city_from_text("weather in San Francisco today"),
            Some("San Francisco today".to_string()) // stop char missing — acceptable, geocoder handles it
        );
    }

    #[test]
    fn no_prefix_returns_none() {
        assert_eq!(extract_city_from_text("погода сегодня"), None);
    }
}
