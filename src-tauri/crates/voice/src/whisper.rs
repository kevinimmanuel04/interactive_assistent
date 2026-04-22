//! Whisper.cpp backend, compiled only when the `stt` feature is enabled.

use super::SttError;
use std::path::Path;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub(super) fn transcribe_impl(model_path: &Path, samples: &[f32]) -> Result<String, SttError> {
    let model_str = model_path
        .to_str()
        .ok_or_else(|| SttError::Whisper("non-UTF8 model path".into()))?;

    let ctx = WhisperContext::new_with_params(model_str, WhisperContextParameters::default())
        .map_err(|e| SttError::Whisper(format!("load model: {e}")))?;
    let mut state = ctx
        .create_state()
        .map_err(|e| SttError::Whisper(format!("create state: {e}")))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(num_cpus::get().min(4) as i32);
    params.set_translate(false);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    // Auto-detect language — whisper decides.
    params.set_language(None);

    state
        .full(params, samples)
        .map_err(|e| SttError::Whisper(format!("inference: {e}")))?;

    let num_segments = state.full_n_segments();
    let mut out = String::new();
    for i in 0..num_segments {
        let seg = state
            .get_segment(i)
            .ok_or_else(|| SttError::Whisper(format!("segment {i} missing")))?;
        let text = seg
            .to_str()
            .map_err(|e| SttError::Whisper(format!("segment {i}: {e}")))?;
        out.push_str(text);
    }
    Ok(out.trim().to_string())
}
