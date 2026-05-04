//! WAV (RIFF) container helpers shared by TTS playback and STT upload.

/// Build a WAV container around an already-encoded little-endian PCM16
/// mono byte stream. Used to wrap streamed OpenAI PCM into something the
/// frontend's HTML audio tag will accept.
pub(super) fn wrap_pcm16_as_wav(pcm: &[u8], sample_rate: u32) -> Vec<u8> {
    let data_size = pcm.len() as u32;
    let chunk_size = 36 + data_size;
    let byte_rate = sample_rate * 2;

    let mut out = Vec::with_capacity(44 + pcm.len());
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&chunk_size.to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes()); // block align
    out.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_size.to_le_bytes());
    out.extend_from_slice(pcm);
    out
}

/// Encode mono f32 samples in `[-1.0, 1.0]` as a 16-bit PCM WAV blob.
/// Used for shipping `Recorder` output to OpenRouter as `input_audio`.
pub(super) fn encode_wav_pcm16_mono(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let num_samples = samples.len();
    let byte_rate = sample_rate * 2; // mono * 16-bit
    let data_size = (num_samples * 2) as u32;
    let chunk_size = 36 + data_size;

    let mut out = Vec::with_capacity(44 + num_samples * 2);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&chunk_size.to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes()); // fmt chunk size
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes()); // block align
    out.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_size.to_le_bytes());
    for &s in samples {
        let clamped = s.clamp(-1.0, 1.0);
        let v = (clamped * i16::MAX as f32) as i16;
        out.extend_from_slice(&v.to_le_bytes());
    }
    out
}

/// Drop a continuous tail of near-silent PCM16 little-endian samples.
/// `noise` is the absolute amplitude threshold in [0, 1]; samples whose
/// |s| / 32767 < noise count as silence. We always keep `keep_ms` of the
/// trailing region so a faint exhale isn't truncated.
pub(super) fn trim_trailing_silence(
    pcm: &[u8],
    sample_rate: u32,
    noise: f32,
    keep_ms: u32,
) -> Vec<u8> {
    if pcm.len() < 4 {
        return pcm.to_vec();
    }
    let n_samples = pcm.len() / 2;
    let threshold = (noise * 32767.0) as i32;
    let mut last_voiced: usize = 0;
    let mut found = false;
    for i in 0..n_samples {
        let lo = pcm[i * 2] as i32;
        let hi = pcm[i * 2 + 1] as i8 as i32;
        let s = (hi << 8) | lo;
        if s.abs() > threshold {
            last_voiced = i;
            found = true;
        }
    }
    if !found {
        return pcm.to_vec();
    }
    let keep_samples = (sample_rate * keep_ms / 1000) as usize;
    let end_sample = (last_voiced + keep_samples + 1).min(n_samples);
    let end_byte = end_sample * 2;
    let trimmed = &pcm[..end_byte];
    if trimmed.len() < pcm.len() {
        tracing::info!(
            removed_bytes = pcm.len() - trimmed.len(),
            removed_seconds = (pcm.len() - trimmed.len()) as f32 / (sample_rate as f32 * 2.0),
            "trimmed trailing silence"
        );
    }
    trimmed.to_vec()
}
