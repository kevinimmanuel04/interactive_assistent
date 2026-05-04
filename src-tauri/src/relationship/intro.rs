//! Best-effort "the user just told us their name" detection.

/// Best-effort name extraction from a user message. Recognises:
/// "меня зовут X", "я X", "my name is X", "i'm X", "i am X".
/// Returns the captured name (trimmed, ≤30 chars) or `None`.
pub fn extract_self_introduction(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let prefixes: &[&str] = &[
        "меня зовут ",
        "моё имя ",
        "мое имя ",
        "my name is ",
        "i am ",
        "i'm ",
        "this is ",
    ];
    for p in prefixes {
        if let Some(idx) = lower.find(p) {
            let start = idx + p.len();
            let rest = &text[start..];
            let stop = rest
                .find(['.', ',', '!', '?', ';', '\n'])
                .unwrap_or(rest.len());
            let cand = rest[..stop].trim();
            // First word only — names are usually a single token.
            let first: String = cand.split_whitespace().next().unwrap_or("").into();
            if first.chars().count() >= 2 && first.chars().count() <= 30 {
                let trimmed =
                    first.trim_matches(|c: char| !c.is_alphanumeric() && c != '-' && c != '\'');
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_self_intro() {
        assert_eq!(
            extract_self_introduction("Привет, меня зовут Никита!"),
            Some("Никита".to_string())
        );
        assert_eq!(
            extract_self_introduction("Hi, my name is Alice."),
            Some("Alice".to_string())
        );
    }
}
