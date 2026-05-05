//! OpenRouter image generation via `/api/v1/chat/completions` with
//! `modalities: ["image", "text"]`. Models like
//! `google/gemini-2.5-flash-image` return an inline image_url.

use crate::{
    decode_data_uri_or_b64, GenerateOk, GenerateRequest, Generator, ImageGenError, Result,
};
use serde::Deserialize;

const URL: &str = "https://openrouter.ai/api/v1/chat/completions";

pub struct OpenRouterImage {
    http: reqwest::Client,
    api_key: String,
    model: String,
}

impl OpenRouterImage {
    pub fn new(api_key: impl Into<String>, model: impl Into<String>) -> Result<Self> {
        let api_key = api_key.into();
        if api_key.trim().is_empty() {
            return Err(ImageGenError::MissingCredential("openrouter_api_key"));
        }
        let http = reqwest::Client::builder()
            .user_agent(concat!("komorebi/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self {
            http,
            api_key,
            model: model.into(),
        })
    }
}

#[derive(Debug, Deserialize)]
struct Resp {
    choices: Option<Vec<Choice>>,
    error: Option<ErrObj>,
}
#[derive(Debug, Deserialize)]
struct Choice {
    message: Msg,
}
#[derive(Debug, Deserialize)]
struct Msg {
    content: Option<serde_json::Value>,
    /// Newer schema: top-level `images: [{ image_url: { url } }]`.
    images: Option<Vec<ImgEntry>>,
}
#[derive(Debug, Deserialize)]
struct ImgEntry {
    image_url: Option<ImgUrl>,
}
#[derive(Debug, Deserialize)]
struct ImgUrl {
    url: String,
}
#[derive(Debug, Deserialize)]
struct ErrObj {
    message: Option<String>,
}

#[async_trait::async_trait]
impl Generator for OpenRouterImage {
    async fn generate(&self, req: &GenerateRequest) -> Result<GenerateOk> {
        let user_text = if let Some(neg) = &req.negative_prompt {
            format!(
                "{}\n\nAvoid: {}\n(Generate a single high-quality image; \
                 target ~{}x{} pixels.)",
                req.prompt.trim(),
                neg.trim(),
                req.width,
                req.height
            )
        } else {
            format!(
                "{}\n\n(Generate a single high-quality image; target ~{}x{} pixels.)",
                req.prompt.trim(),
                req.width,
                req.height
            )
        };

        let body = serde_json::json!({
            "model": self.model,
            "modalities": ["image", "text"],
            "messages": [{ "role": "user", "content": user_text }]
        });

        let resp = self
            .http
            .post(URL)
            .bearer_auth(&self.api_key)
            .header("HTTP-Referer", "https://komorebi.svitix.com")
            .header("X-Title", "Komorebi")
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        let text = resp.text().await?;
        if !status.is_success() {
            return Err(ImageGenError::Provider(format!(
                "openrouter {}: {}",
                status,
                text.chars().take(400).collect::<String>()
            )));
        }
        let parsed: Resp = serde_json::from_str(&text).map_err(|e| {
            ImageGenError::Decode(format!("{e}; body={}", &text[..text.len().min(400)]))
        })?;
        if let Some(err) = parsed.error {
            return Err(ImageGenError::Provider(
                err.message.unwrap_or_else(|| "openrouter error".into()),
            ));
        }
        let choice = parsed
            .choices
            .and_then(|mut v| v.drain(..).next())
            .ok_or(ImageGenError::NoImage)?;
        let url = extract_image_url(&choice.message).ok_or(ImageGenError::NoImage)?;
        let bytes = if url.starts_with("data:") {
            decode_data_uri_or_b64(&url)?
        } else {
            // Some integrations return a plain HTTPS URL instead of a data
            // URI — fetch it. Bound by a short timeout so a hung CDN doesn't
            // wedge the chat pipeline.
            let r = self
                .http
                .get(&url)
                .timeout(std::time::Duration::from_secs(45))
                .send()
                .await?;
            if !r.status().is_success() {
                return Err(ImageGenError::Provider(format!(
                    "image fetch {}: {}",
                    r.status(),
                    url
                )));
            }
            r.bytes().await?.to_vec()
        };
        Ok(GenerateOk {
            png: bytes,
            revised_prompt: None,
        })
    }
}

fn extract_image_url(msg: &Msg) -> Option<String> {
    if let Some(imgs) = &msg.images {
        for entry in imgs {
            if let Some(u) = &entry.image_url {
                return Some(u.url.clone());
            }
        }
    }
    // Fallback: scan content array (older schema).
    if let Some(content) = &msg.content {
        if let Some(arr) = content.as_array() {
            for part in arr {
                if part.get("type").and_then(|v| v.as_str()) == Some("image_url") {
                    if let Some(u) = part
                        .get("image_url")
                        .and_then(|x| x.get("url"))
                        .and_then(|v| v.as_str())
                    {
                        return Some(u.to_string());
                    }
                }
            }
        }
    }
    None
}
