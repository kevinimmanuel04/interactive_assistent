//! Real llama.cpp engine. Compiled only when the `local-llm` feature is on
//! because it pulls in the `llama-cpp-2` crate which requires a C++ toolchain.
//!
//! Verified at build time in CI; local dev builds default to the stub engine.

use crate::{LlmConfig, LlmEngine, LlmError, LlmEvent, LlmStream};
use async_trait::async_trait;
use futures::stream::StreamExt;
use komorebi_router::{ChatMessage, Role};
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;

/// Shared lazily-loaded model. The backend is a process-wide singleton.
struct Loaded {
    #[allow(dead_code)] // kept alive for the lifetime of the model
    backend: Arc<LlamaBackend>,
    model: Arc<LlamaModel>,
    path: PathBuf,
}

pub struct LlamaEngine {
    cfg: LlmConfig,
    backend: Arc<LlamaBackend>,
    loaded: Mutex<Option<Loaded>>,
}

impl LlamaEngine {
    /// Initialize the backend. Returns `None` if the backend cannot start
    /// (e.g. missing shared libs); the caller falls back to the stub.
    pub fn try_new(cfg: LlmConfig) -> Option<Self> {
        let backend = LlamaBackend::init().ok()?;
        Some(Self {
            cfg,
            backend: Arc::new(backend),
            loaded: Mutex::new(None),
        })
    }

    fn ensure_loaded(&self) -> Result<Arc<LlamaModel>, LlmError> {
        let path = self
            .cfg
            .model_path
            .clone()
            .ok_or_else(|| LlmError::Other("no local model path configured".into()))?;
        let mut slot = self
            .loaded
            .lock()
            .map_err(|_| LlmError::Other("llm mutex poisoned".into()))?;
        if let Some(l) = slot.as_ref() {
            if l.path == path {
                return Ok(l.model.clone());
            }
        }
        let mut params = LlamaModelParams::default();
        // GPU offload: honor the user's explicit setting when present; in
        // auto-mode try to offload everything and let the backend clamp to
        // the number of layers actually available.
        if let Some(n) = self.cfg.n_gpu_layers {
            params = params.with_n_gpu_layers(n as u32);
        }
        let model = LlamaModel::load_from_file(&self.backend, &path, &params)
            .map_err(|e| LlmError::Other(format!("load model: {e}")))?;
        let model = Arc::new(model);
        *slot = Some(Loaded {
            backend: self.backend.clone(),
            model: model.clone(),
            path,
        });
        Ok(model)
    }
}

#[async_trait]
impl LlmEngine for LlamaEngine {
    async fn stream_chat(&self, messages: &[ChatMessage]) -> Result<LlmStream, LlmError> {
        let model = self.ensure_loaded()?;
        let prompt = render_llama3_prompt(messages);
        let n_ctx = self.cfg.n_ctx;
        let n_threads = self.cfg.n_threads;
        let backend = self.backend.clone();

        let (tx, rx) = mpsc::channel::<Result<LlmEvent, LlmError>>(32);

        // Heavy blocking work goes on the blocking thread pool.
        tokio::task::spawn_blocking(move || {
            if let Err(e) = generate_blocking(&backend, &model, &prompt, n_ctx, n_threads, &tx) {
                let _ = tx.blocking_send(Err(e));
            } else {
                let _ = tx.blocking_send(Ok(LlmEvent::Done));
            }
        });

        let stream = tokio_stream::wrappers::ReceiverStream::new(rx);
        Ok(Box::pin(stream.map(|x| x)))
    }
}

fn generate_blocking(
    backend: &LlamaBackend,
    model: &LlamaModel,
    prompt: &str,
    n_ctx: u32,
    n_threads: i32,
    tx: &mpsc::Sender<Result<LlmEvent, LlmError>>,
) -> Result<(), LlmError> {
    let mut ctx_params = LlamaContextParams::default().with_n_ctx(NonZeroU32::new(n_ctx.max(512)));
    if n_threads > 0 {
        ctx_params = ctx_params.with_n_threads(n_threads);
    }

    let mut ctx = model
        .new_context(backend, ctx_params)
        .map_err(|e| LlmError::Other(format!("new_context: {e}")))?;

    let tokens = model
        .str_to_token(prompt, AddBos::Always)
        .map_err(|e| LlmError::Other(format!("tokenize: {e}")))?;

    let n_ctx_i = ctx.n_ctx() as i32;
    let max_new = (n_ctx_i - tokens.len() as i32).max(16).min(1024);
    let n_len = tokens.len() as i32 + max_new;

    let mut batch = LlamaBatch::new(n_ctx_i as usize, 1);
    let last_index = tokens.len() as i32 - 1;
    for (i, tok) in (0i32..).zip(tokens.into_iter()) {
        let is_last = i == last_index;
        batch
            .add(tok, i, &[0], is_last)
            .map_err(|e| LlmError::Other(format!("batch.add: {e}")))?;
    }
    ctx.decode(&mut batch)
        .map_err(|e| LlmError::Other(format!("decode: {e}")))?;

    let mut n_cur = batch.n_tokens();
    let mut decoder = encoding_rs::UTF_8.new_decoder();
    let mut sampler = LlamaSampler::chain_simple([
        LlamaSampler::temp(0.7),
        LlamaSampler::top_p(0.95, 1),
        LlamaSampler::dist(1234),
    ]);

    while n_cur <= n_len {
        let token = sampler.sample(&ctx, batch.n_tokens() - 1);
        sampler.accept(token);
        if model.is_eog_token(token) {
            break;
        }
        let piece = model
            .token_to_piece(token, &mut decoder, true, None)
            .map_err(|e| LlmError::Other(format!("token_to_piece: {e}")))?;
        if tx.blocking_send(Ok(LlmEvent::Token(piece))).is_err() {
            // Receiver dropped — consumer cancelled.
            return Ok(());
        }
        batch.clear();
        batch
            .add(token, n_cur, &[0], true)
            .map_err(|e| LlmError::Other(format!("batch.add loop: {e}")))?;
        n_cur += 1;
        ctx.decode(&mut batch)
            .map_err(|e| LlmError::Other(format!("decode loop: {e}")))?;
    }
    Ok(())
}

/// Render the conversation in Llama 3 / 3.1 / 3.2 instruct chat format.
/// Assumes `AddBos::Always` will prepend `<|begin_of_text|>`.
fn render_llama3_prompt(messages: &[ChatMessage]) -> String {
    let mut out = String::new();
    for m in messages {
        let role = match m.role {
            Role::System => "system",
            Role::User => "user",
            Role::Assistant => "assistant",
        };
        out.push_str("<|start_header_id|>");
        out.push_str(role);
        out.push_str("<|end_header_id|>\n\n");
        out.push_str(&m.content);
        out.push_str("<|eot_id|>");
    }
    out.push_str("<|start_header_id|>assistant<|end_header_id|>\n\n");
    out
}
