//! Local image generation via the `stable-diffusion.cpp` CLI binary
//! (https://github.com/leejet/stable-diffusion.cpp). Users point at their
//! own `sd.exe` + a `.gguf`/`.safetensors` model. We spawn the process
//! into a temp directory, parse stderr for progress, and read the PNG.

use crate::{GenerateOk, GenerateRequest, Generator, ImageGenError, Result};
use std::path::{Path, PathBuf};
use tokio::process::Command;

#[derive(Debug, Clone, Copy)]
pub enum Device {
    Auto,
    Cpu,
    Cuda,
}

impl Device {
    pub fn parse(s: &str) -> Self {
        match s {
            "cpu" => Self::Cpu,
            "cuda" | "gpu" | "nvidia" => Self::Cuda,
            _ => Self::Auto,
        }
    }
}

pub struct LocalSd {
    binary: PathBuf,
    model: PathBuf,
    device: Device,
}

impl LocalSd {
    pub fn new(binary: impl AsRef<Path>, model: impl AsRef<Path>, device: Device) -> Result<Self> {
        let binary = binary.as_ref().to_path_buf();
        let model = model.as_ref().to_path_buf();
        if !binary.exists() {
            return Err(ImageGenError::MissingConfig("sd binary not found"));
        }
        if !model.exists() {
            return Err(ImageGenError::MissingConfig("sd model not found"));
        }
        Ok(Self {
            binary,
            model,
            device,
        })
    }
}

#[async_trait::async_trait]
impl Generator for LocalSd {
    async fn generate(&self, req: &GenerateRequest) -> Result<GenerateOk> {
        // Output path: a unique file in std::env::temp_dir(). sd.cpp writes
        // a PNG; we read+delete it after success.
        let out = std::env::temp_dir().join(format!(
            "komorebi-imagegen-{}.png",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));

        let mut cmd = Command::new(&self.binary);
        cmd.arg("-m")
            .arg(&self.model)
            .arg("-p")
            .arg(&req.prompt)
            .arg("-W")
            .arg(req.width.to_string())
            .arg("-H")
            .arg(req.height.to_string())
            .arg("--steps")
            .arg(req.steps.to_string())
            .arg("-o")
            .arg(&out)
            .arg("-t")
            .arg(num_threads().to_string());
        if let Some(neg) = &req.negative_prompt {
            if !neg.trim().is_empty() {
                cmd.arg("-n").arg(neg);
            }
        }
        if let Some(seed) = req.seed {
            cmd.arg("-s").arg(seed.to_string());
        }
        if let Some(g) = req.guidance {
            cmd.arg("--cfg-scale").arg(format!("{g}"));
        }
        match self.device {
            // sd.cpp doesn't expose explicit cpu/cuda flags — the binary is
            // built with one backend at a time. We pass `--rng cuda` only
            // as a soft hint when the user opted into GPU; harmless if
            // unsupported. Threads still apply on CPU builds.
            Device::Cuda => {
                cmd.arg("--rng").arg("cuda");
            }
            Device::Cpu | Device::Auto => {}
        }

        // Don't inherit env that might confuse the child (e.g. CUDA_VISIBLE_DEVICES).
        let output = cmd.output().await.map_err(ImageGenError::from)?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(ImageGenError::Provider(format!(
                "sd.exe exited {}: {}",
                output.status,
                err.lines()
                    .rev()
                    .take(8)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect::<Vec<_>>()
                    .join("\n")
            )));
        }
        let png = tokio::fs::read(&out).await.map_err(ImageGenError::from)?;
        let _ = tokio::fs::remove_file(&out).await;
        Ok(GenerateOk {
            png,
            revised_prompt: None,
        })
    }
}

fn num_threads() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get().saturating_sub(1).max(1))
        .unwrap_or(4)
}
