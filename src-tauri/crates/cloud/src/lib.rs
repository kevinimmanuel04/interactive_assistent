//! OpenRouter cloud client (streaming chat completions via SSE).
//!
//! API reference: https://openrouter.ai/docs/api-reference/chat-completion
//!
//! Security: the API key is never stored in this crate. Callers retrieve it
//! from a secure store (Phase 1: tauri-plugin-store; Phase 3 hardening: OS keyring)
//! and pass it in via [`OpenRouterClient::new`].

use futures::{Stream, StreamExt};
use komorebi_router::ChatMessage;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

pub const DEFAULT_MODEL: &str = "anthropic/claude-3.5-sonnet";
const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

#[derive(thiserror::Error, Debug)]
pub enum CloudError {
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("missing api key")]
    MissingApiKey,
    #[error("api error {status}: {body}")]
    Api { status: u16, body: String },
    #[error("malformed stream: {0}")]
    Stream(String),
}

#[derive(Debug, Clone, Serialize)]
struct RequestBody<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct StreamChunk {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    delta: Delta,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Delta {
    #[serde(default)]
    content: Option<String>,
}

#[derive(Debug, Clone)]
pub enum StreamEvent {
    Token(String),
    Done,
}

pub type TokenStream = Pin<Box<dyn Stream<Item = Result<StreamEvent, CloudError>> + Send>>;

#[derive(Clone)]
pub struct OpenRouterClient {
    http: reqwest::Client,
    api_key: String,
    app_referer: String,
    app_title: String,
}

impl OpenRouterClient {
    pub fn new(api_key: impl Into<String>) -> Result<Self, CloudError> {
        let api_key = api_key.into();
        if api_key.trim().is_empty() {
            return Err(CloudError::MissingApiKey);
        }
        let http = reqwest::Client::builder()
            .user_agent(concat!("komorebi/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self {
            http,
            api_key,
            app_referer: "https://komorebi.app".into(),
            app_title: "Komorebi".into(),
        })
    }

    pub async fn stream_chat(
        &self,
        model: &str,
        messages: &[ChatMessage],
    ) -> Result<TokenStream, CloudError> {
        let body = RequestBody {
            model,
            messages,
            stream: true,
            temperature: Some(0.7),
            max_tokens: Some(1024),
        };

        let resp = self
            .http
            .post(OPENROUTER_URL)
            .bearer_auth(&self.api_key)
            .header("HTTP-Referer", &self.app_referer)
            .header("X-Title", &self.app_title)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(CloudError::Api { status: status.as_u16(), body });
        }

        // Parse Server-Sent Events: lines starting with "data: " carry JSON payloads,
        // terminated by "data: [DONE]".
        let byte_stream = resp.bytes_stream();
        let event_stream = sse_to_events(byte_stream);
        Ok(Box::pin(event_stream))
    }
}

fn sse_to_events<S>(bytes: S) -> impl Stream<Item = Result<StreamEvent, CloudError>> + Send
where
    S: Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Send + 'static,
{
    async_stream::stream! {
        let mut buf = String::new();
        let mut stream = Box::pin(bytes);
        while let Some(chunk) = stream.next().await {
            let chunk = match chunk {
                Ok(b) => b,
                Err(e) => { yield Err(CloudError::Http(e)); return; }
            };
            buf.push_str(&String::from_utf8_lossy(&chunk));

            // SSE events are separated by blank lines, but OpenRouter streams one
            // JSON object per "data: " line, so we can split on newlines directly.
            while let Some(nl) = buf.find('\n') {
                let line = buf[..nl].trim_end_matches('\r').to_string();
                buf.drain(..=nl);
                let Some(payload) = line.strip_prefix("data: ").or_else(|| line.strip_prefix("data:")) else {
                    continue;
                };
                let payload = payload.trim();
                if payload.is_empty() { continue; }
                if payload == "[DONE]" {
                    yield Ok(StreamEvent::Done);
                    return;
                }
                match serde_json::from_str::<StreamChunk>(payload) {
                    Ok(chunk) => {
                        for ch in chunk.choices {
                            if let Some(t) = ch.delta.content {
                                if !t.is_empty() {
                                    yield Ok(StreamEvent::Token(t));
                                }
                            }
                            if ch.finish_reason.is_some() {
                                yield Ok(StreamEvent::Done);
                                return;
                            }
                        }
                    }
                    Err(e) => {
                        tracing::debug!(?e, payload = %payload, "skip malformed sse chunk");
                    }
                }
            }
        }
        yield Ok(StreamEvent::Done);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures::stream;

    fn bytes_stream(chunks: &[&str]) -> impl Stream<Item = Result<bytes::Bytes, reqwest::Error>> {
        let items: Vec<_> = chunks
            .iter()
            .map(|s| Ok(bytes::Bytes::from(s.to_string())))
            .collect();
        stream::iter(items)
    }

    #[tokio::test]
    async fn parses_tokens_and_done() {
        let raw = [
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n",
            "data: [DONE]\n",
        ];
        let s = sse_to_events(bytes_stream(&raw));
        let out: Vec<_> = Box::pin(s).collect::<Vec<_>>().await;
        let tokens: Vec<String> = out
            .into_iter()
            .filter_map(|r| match r.ok()? {
                StreamEvent::Token(t) => Some(t),
                StreamEvent::Done => None,
            })
            .collect();
        assert_eq!(tokens.join(""), "Hello");
    }

    #[tokio::test]
    async fn skips_malformed_chunks() {
        let raw = [
            "data: not-json\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n",
            "data: [DONE]\n",
        ];
        let s = sse_to_events(bytes_stream(&raw));
        let out: Vec<_> = Box::pin(s).collect::<Vec<_>>().await;
        let tokens: Vec<String> = out
            .into_iter()
            .filter_map(|r| match r.ok()? {
                StreamEvent::Token(t) => Some(t),
                _ => None,
            })
            .collect();
        assert_eq!(tokens, vec!["ok"]);
    }
}
