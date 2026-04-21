//! Clipboard skill — read or write the system clipboard.
//!
//! Queries supported:
//!   - "что в буфере", "read clipboard", "прочитай буфер" → returns contents
//!   - "скопируй X", "copy X"                             → puts X on clipboard

use async_trait::async_trait;

use crate::{norm, Skill, SkillContext, SkillError, SkillResponse};

pub struct ClipboardSkill;

enum Action {
    Read,
    Write(String),
}

fn parse(query: &str) -> Option<Action> {
    let q = norm(query);
    if (q.contains("буфер") || q.contains("clipboard"))
        && (q.contains("что")
            || q.contains("прочит")
            || q.contains("read")
            || q.contains("show")
            || q.contains("get"))
    {
        return Some(Action::Read);
    }
    // "скопируй <payload>" / "copy <payload>"
    for prefix in ["скопируй ", "copy "] {
        if let Some(idx) = q.find(prefix) {
            let payload = query[idx + prefix.len()..].trim();
            if !payload.is_empty() {
                return Some(Action::Write(payload.to_string()));
            }
        }
    }
    if q == "что в буфере" || q == "read clipboard" {
        return Some(Action::Read);
    }
    None
}

#[async_trait]
impl Skill for ClipboardSkill {
    fn name(&self) -> &'static str {
        "clipboard"
    }

    fn matches(&self, query: &str) -> bool {
        parse(query).is_some()
    }

    async fn execute(&self, ctx: SkillContext) -> Result<SkillResponse, SkillError> {
        let action = parse(&ctx.query).ok_or(SkillError::NotApplicable)?;
        // arboard is synchronous and holds OS handles; run it on a blocking
        // thread so we don't stall the tokio reactor.
        tokio::task::spawn_blocking(move || -> Result<SkillResponse, SkillError> {
            let mut cb = arboard::Clipboard::new()
                .map_err(|e| SkillError::Exec(format!("clipboard init: {e}")))?;
            match action {
                Action::Read => {
                    let text = cb
                        .get_text()
                        .map_err(|e| SkillError::Exec(format!("clipboard read: {e}")))?;
                    let preview: String = if text.chars().count() > 500 {
                        let head: String = text.chars().take(500).collect();
                        format!("{head}…")
                    } else {
                        text
                    };
                    Ok(SkillResponse {
                        text: format!("Clipboard:\n{preview}"),
                    })
                }
                Action::Write(payload) => {
                    cb.set_text(payload.clone())
                        .map_err(|e| SkillError::Exec(format!("clipboard write: {e}")))?;
                    Ok(SkillResponse {
                        text: format!("Copied to clipboard: {payload}"),
                    })
                }
            }
        })
        .await
        .map_err(|e| SkillError::Exec(format!("join error: {e}")))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_read() {
        assert!(matches!(parse("что в буфере обмена"), Some(Action::Read)));
        assert!(matches!(parse("read clipboard"), Some(Action::Read)));
    }

    #[test]
    fn parses_write() {
        match parse("скопируй Hello world") {
            Some(Action::Write(s)) => assert_eq!(s, "Hello world"),
            _ => panic!("expected Write"),
        }
        match parse("copy foo bar") {
            Some(Action::Write(s)) => assert_eq!(s, "foo bar"),
            _ => panic!("expected Write"),
        }
    }

    #[test]
    fn ignores_unrelated() {
        assert!(parse("привет").is_none());
    }
}
