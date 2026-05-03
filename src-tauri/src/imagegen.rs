//! Image-generation orchestrator. Resolves the user's chosen provider,
//! invokes it on a background task, and emits `image:*` events.
//!
//! Events emitted:
//! - `image:started`  — `{ id, provider, width, height }`
//! - `image:done`     — `{ id, png_base64, save_path, mime, width, height }`
//! - `image:error`    — `{ id, message }`

use crate::settings;
use base64::Engine as _;
use komorebi_imagegen::{
    local::{Device, LocalSd},
    openrouter::OpenRouterImage,
    replicate::ReplicateImage,
    GenerateRequest, Generator, ImageGenError,
};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, Wry};

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ImageEvent {
    Started {
        id: String,
        provider: String,
        width: u32,
        height: u32,
    },
    Done {
        id: String,
        png_base64: String,
        save_path: Option<String>,
        mime: String,
    },
    Error {
        id: String,
        message: String,
    },
}

fn emit(app: &AppHandle<Wry>, evt: ImageEvent) {
    if let Err(e) = app.emit("image", &evt) {
        tracing::warn!(?e, "failed to emit image event");
    }
}

/// Cooperative cancel flag shared with the in-flight generation.
#[derive(Default)]
pub struct ImageGenState {
    pub cancel: AtomicBool,
}

pub fn cancel(app: &AppHandle<Wry>) {
    if let Some(s) = app.try_state::<Arc<ImageGenState>>() {
        s.cancel.store(true, Ordering::SeqCst);
    }
}

/// Build a `Generator` according to the user's settings. Falls back to an
/// error if the chosen provider is missing required configuration.
fn build_generator(app: &AppHandle<Wry>) -> Result<Box<dyn Generator>, ImageGenError> {
    let provider = settings::get_imagegen_provider(app);
    match provider.as_str() {
        "replicate" => {
            let token = settings::get_replicate_token(app)
                .ok_or(ImageGenError::MissingCredential("replicate_api_token"))?;
            let model = settings::get_imagegen_replicate_model(app);
            Ok(Box::new(ReplicateImage::new(token, model)?))
        }
        "local" => {
            let bin = settings::get_imagegen_local_binary(app)
                .ok_or(ImageGenError::MissingConfig("imagegen_local_binary"))?;
            let model = settings::get_imagegen_local_model(app)
                .ok_or(ImageGenError::MissingConfig("imagegen_local_model"))?;
            let device = Device::parse(&settings::get_imagegen_device(app));
            Ok(Box::new(LocalSd::new(bin, model, device)?))
        }
        // Default + "openrouter".
        _ => {
            let key = settings::get_openrouter_key(app)
                .ok_or(ImageGenError::MissingCredential("openrouter_api_key"))?;
            let model = settings::get_imagegen_openrouter_model(app);
            Ok(Box::new(OpenRouterImage::new(key, model)?))
        }
    }
}

pub fn spawn_generation(
    app: AppHandle<Wry>,
    id: String,
    prompt: String,
    width: Option<u32>,
    height: Option<u32>,
) {
    if let Some(state) = app.try_state::<Arc<ImageGenState>>() {
        state.cancel.store(false, Ordering::SeqCst);
    }
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_generation(app.clone(), id.clone(), prompt, width, height).await {
            emit(
                &app,
                ImageEvent::Error {
                    id,
                    message: e.to_string(),
                },
            );
        }
    });
}

async fn run_generation(
    app: AppHandle<Wry>,
    id: String,
    prompt: String,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<(), ImageGenError> {
    let provider = settings::get_imagegen_provider(&app);
    let w = width.unwrap_or_else(|| settings::get_imagegen_width(&app) as u32);
    let h = height.unwrap_or_else(|| settings::get_imagegen_height(&app) as u32);
    emit(
        &app,
        ImageEvent::Started {
            id: id.clone(),
            provider: provider.clone(),
            width: w,
            height: h,
        },
    );

    let req = GenerateRequest {
        prompt,
        negative_prompt: settings::get_imagegen_negative_prompt(&app),
        width: w,
        height: h,
        steps: settings::get_imagegen_steps(&app) as u32,
        seed: None,
        guidance: None,
    };

    let gen = build_generator(&app)?;
    // Run in a JoinHandle so cancel can drop it cleanly.
    let task = tokio::spawn(async move { gen.generate(&req).await });
    let cancel = app
        .try_state::<Arc<ImageGenState>>()
        .map(|s| s.inner().clone());
    let result = if let Some(state) = cancel {
        tokio::select! {
            r = task => r.map_err(|e| ImageGenError::Provider(format!("task join: {e}")))?,
            _ = wait_cancel(state.clone()) => return Err(ImageGenError::Cancelled),
        }
    } else {
        task.await
            .map_err(|e| ImageGenError::Provider(format!("task join: {e}")))?
    };
    let ok = result?;

    let save_path = save_to_disk(&app, &ok.png).ok();
    let png_base64 = base64::engine::general_purpose::STANDARD.encode(&ok.png);
    emit(
        &app,
        ImageEvent::Done {
            id,
            png_base64,
            save_path,
            mime: "image/png".into(),
        },
    );
    Ok(())
}

async fn wait_cancel(state: Arc<ImageGenState>) {
    loop {
        if state.cancel.load(Ordering::SeqCst) {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }
}

fn save_to_disk(app: &AppHandle<Wry>, png: &[u8]) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("generated");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let mut path = dir.join(format!("img-{stamp}.png"));
    // Avoid collisions on rapid back-to-back generations.
    let mut suffix = 1u32;
    while path.exists() {
        path = dir.join(format!("img-{stamp}-{suffix}.png"));
        suffix += 1;
    }
    std::fs::write(&path, png).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Synchronously save a base64 PNG to a user-chosen path. Used by the
/// "Save as…" button after generation.
pub fn save_image_to_path(png_base64: &str, target: &str) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.trim())
        .map_err(|e| e.to_string())?;
    std::fs::write(target, bytes).map_err(|e| e.to_string())
}
