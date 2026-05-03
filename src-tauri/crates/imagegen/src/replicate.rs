//! Replicate.com REST API. Creates a prediction, polls until it reaches a
//! terminal state, then downloads the resulting image bytes.

use crate::{GenerateOk, GenerateRequest, Generator, ImageGenError, Result};
use serde::{Deserialize, Serialize};

const BASE: &str = "https://api.replicate.com/v1";

pub struct ReplicateImage {
    http: reqwest::Client,
    token: String,
    /// Either a fully-qualified `owner/name:version` ref, or just
    /// `owner/name` (we'll resolve the latest version automatically).
    model: String,
}

impl ReplicateImage {
    pub fn new(token: impl Into<String>, model: impl Into<String>) -> Result<Self> {
        let token = token.into();
        if token.trim().is_empty() {
            return Err(ImageGenError::MissingCredential("replicate_api_token"));
        }
        let http = reqwest::Client::builder()
            .user_agent(concat!("komorebi/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self {
            http,
            token,
            model: model.into(),
        })
    }
}

#[derive(Debug, Deserialize)]
struct Prediction {
    id: String,
    status: String,
    output: Option<serde_json::Value>,
    error: Option<serde_json::Value>,
    urls: Option<PredictionUrls>,
}

#[derive(Debug, Deserialize)]
struct PredictionUrls {
    get: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ModelInfo {
    latest_version: Option<VersionRef>,
}

#[derive(Debug, Deserialize)]
struct VersionRef {
    id: String,
}

#[derive(Debug, Serialize)]
struct CreateBody<'a> {
    version: Option<&'a str>,
    input: serde_json::Value,
}

#[async_trait::async_trait]
impl Generator for ReplicateImage {
    async fn generate(&self, req: &GenerateRequest) -> Result<GenerateOk> {
        let mut input = serde_json::json!({
            "prompt": req.prompt,
            "width": req.width,
            "height": req.height,
            "num_inference_steps": req.steps,
        });
        if let Some(neg) = &req.negative_prompt {
            input["negative_prompt"] = serde_json::Value::String(neg.clone());
        }
        if let Some(seed) = req.seed {
            input["seed"] = serde_json::Value::from(seed);
        }
        if let Some(g) = req.guidance {
            input["guidance_scale"] = serde_json::Value::from(g as f64);
        }

        // Two URL forms depending on whether the user supplied a pinned
        // version: `models/{owner}/{name}/predictions` for "always latest"
        // vs `predictions` with a version field.
        let create_url = if let Some(_pinned) = self.model.split_once(':') {
            format!("{BASE}/predictions")
        } else {
            format!("{BASE}/models/{}/predictions", self.model)
        };
        let body = if let Some((_, version)) = self.model.split_once(':') {
            CreateBody {
                version: Some(version),
                input,
            }
        } else {
            CreateBody {
                version: None,
                input,
            }
        };

        let resp = self
            .http
            .post(&create_url)
            .bearer_auth(&self.token)
            .header("Prefer", "wait=30")
            .json(&body)
            .send()
            .await?;
        let status = resp.status();
        let text = resp.text().await?;
        if !status.is_success() {
            return Err(ImageGenError::Provider(format!(
                "replicate {}: {}",
                status,
                text.chars().take(400).collect::<String>()
            )));
        }
        let mut pred: Prediction =
            serde_json::from_str(&text).map_err(|e| ImageGenError::Decode(e.to_string()))?;

        // If `Prefer: wait` already finished it, skip polling.
        let mut tries = 0;
        while pred.status == "starting" || pred.status == "processing" {
            tries += 1;
            if tries > 90 {
                return Err(ImageGenError::Timeout);
            }
            tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
            let url = pred
                .urls
                .as_ref()
                .and_then(|u| u.get.clone())
                .unwrap_or_else(|| format!("{BASE}/predictions/{}", pred.id));
            let r = self.http.get(&url).bearer_auth(&self.token).send().await?;
            let s = r.status();
            let t = r.text().await?;
            if !s.is_success() {
                return Err(ImageGenError::Provider(format!("replicate poll {s}: {t}")));
            }
            pred = serde_json::from_str(&t).map_err(|e| ImageGenError::Decode(e.to_string()))?;
        }
        if pred.status == "failed" || pred.status == "canceled" {
            return Err(ImageGenError::Provider(
                pred.error
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| format!("replicate status: {}", pred.status)),
            ));
        }
        let url = first_output_url(&pred.output).ok_or(ImageGenError::NoImage)?;
        let bytes = self
            .http
            .get(&url)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .await?
            .bytes()
            .await?
            .to_vec();
        Ok(GenerateOk {
            png: bytes,
            revised_prompt: None,
        })
    }
}

#[allow(dead_code)]
async fn resolve_latest_version(
    http: &reqwest::Client,
    token: &str,
    model: &str,
) -> Result<String> {
    let r = http
        .get(format!("{BASE}/models/{model}"))
        .bearer_auth(token)
        .send()
        .await?
        .error_for_status()?;
    let info: ModelInfo = r.json().await?;
    info.latest_version
        .map(|v| v.id)
        .ok_or_else(|| ImageGenError::Provider("model has no versions".into()))
}

fn first_output_url(out: &Option<serde_json::Value>) -> Option<String> {
    let v = out.as_ref()?;
    match v {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Array(arr) => arr.iter().find_map(|e| e.as_str().map(|s| s.to_string())),
        _ => None,
    }
}
