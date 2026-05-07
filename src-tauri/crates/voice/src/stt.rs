//! Mic capture + Whisper.cpp transcription.
//!
//! Audio capture via `cpal` is always compiled in; transcription uses the
//! `whisper-rs` crate behind the `stt` feature (requires CMake + C++).
//! Without that feature `transcribe` returns `NotAvailable` and the caller
//! falls back to typing.
//!
//! `cpal::Stream` is `!Send` on Windows (COM apartment affinity), so the
//! active stream lives inside a dedicated worker thread. The `Recorder`
//! handle is `Send + Sync` and talks to that thread over an mpsc channel.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Sender};
use std::sync::Arc;

#[derive(thiserror::Error, Debug)]
pub enum SttError {
    #[error("no input device available")]
    NoInputDevice,
    #[error("audio capture: {0}")]
    Capture(String),
    #[error("no recording in progress")]
    NotRecording,
    #[error("STT not available: enable the `stt` Cargo feature and set a Whisper model path")]
    NotAvailable,
    #[error("whisper: {0}")]
    Whisper(String),
    #[error("recording is empty")]
    EmptyRecording,
    #[error("recorder worker is gone")]
    WorkerGone,
}

/// Captured audio (mono f32 at the device sample rate).
#[derive(Default)]
struct Recording {
    samples: Vec<f32>,
    input_rate: u32,
}

enum Command {
    Start {
        device: Option<String>,
        reply: Sender<Result<(), SttError>>,
    },
    Stop(Sender<Result<Vec<f32>, SttError>>),
}

/// Public handle. Cheap to clone. `Send + Sync` because the !Send cpal stream
/// is confined to a private worker thread.
#[derive(Clone)]
pub struct Recorder {
    tx: Sender<Command>,
    recording: Arc<Mutex<bool>>,
}

impl Default for Recorder {
    fn default() -> Self {
        Self::new()
    }
}

impl Recorder {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel::<Command>();
        let recording = Arc::new(Mutex::new(false));
        let recording_w = recording.clone();

        std::thread::Builder::new()
            .name("komorebi-audio".into())
            .spawn(move || worker_loop(rx, recording_w))
            .expect("spawn audio worker");

        Self { tx, recording }
    }

    pub fn is_recording(&self) -> bool {
        *self.recording.lock()
    }

    pub fn start(&self) -> Result<(), SttError> {
        self.start_with_device(None)
    }

    /// Start capture from a specific input device by name. Falls back to the
    /// system default when `name` is `None` or no device matches.
    pub fn start_with_device(&self, name: Option<String>) -> Result<(), SttError> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(Command::Start {
                device: name,
                reply: tx,
            })
            .map_err(|_| SttError::WorkerGone)?;
        rx.recv().map_err(|_| SttError::WorkerGone)?
    }

    pub fn stop(&self) -> Result<Vec<f32>, SttError> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(Command::Stop(tx))
            .map_err(|_| SttError::WorkerGone)?;
        rx.recv().map_err(|_| SttError::WorkerGone)?
    }
}

fn worker_loop(rx: mpsc::Receiver<Command>, recording_flag: Arc<Mutex<bool>>) {
    let mut active: Option<(cpal::Stream, Arc<Mutex<Recording>>)> = None;

    while let Ok(cmd) = rx.recv() {
        match cmd {
            Command::Start { device, reply } => {
                if active.is_some() {
                    let _ = reply.send(Err(SttError::Capture("already recording".into())));
                    continue;
                }
                match build_stream(device.as_deref()) {
                    Ok((stream, buf)) => {
                        active = Some((stream, buf));
                        *recording_flag.lock() = true;
                        let _ = reply.send(Ok(()));
                    }
                    Err(e) => {
                        let _ = reply.send(Err(e));
                    }
                }
            }
            Command::Stop(reply) => {
                let Some((stream, buf)) = active.take() else {
                    let _ = reply.send(Err(SttError::NotRecording));
                    continue;
                };
                drop(stream); // stops capture
                *recording_flag.lock() = false;
                let rec = std::mem::take(&mut *buf.lock());
                if rec.samples.is_empty() {
                    let _ = reply.send(Err(SttError::EmptyRecording));
                } else {
                    let out = resample_to_16k(&rec.samples, rec.input_rate);
                    let _ = reply.send(Ok(out));
                }
            }
        }
    }
}

fn build_stream(
    preferred: Option<&str>,
) -> Result<(cpal::Stream, Arc<Mutex<Recording>>), SttError> {
    let host = cpal::default_host();
    let device = pick_input_device(&host, preferred).ok_or(SttError::NoInputDevice)?;
    let config = device
        .default_input_config()
        .map_err(|e| SttError::Capture(e.to_string()))?;
    let channels = config.channels() as usize;
    let sample_rate = config.sample_rate();

    let buf = Arc::new(Mutex::new(Recording {
        samples: Vec::with_capacity(sample_rate as usize * 8),
        input_rate: sample_rate,
    }));
    let buf_cb = buf.clone();

    let err_fn = |e| tracing::warn!(?e, "cpal input stream error");
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config.into(),
            move |data: &[f32], _| append_mono_f32(&mut buf_cb.lock().samples, data, channels),
            err_fn,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &config.into(),
            move |data: &[i16], _| {
                let mut dst = buf_cb.lock();
                for frame in data.chunks(channels) {
                    let mut acc = 0f32;
                    for s in frame {
                        acc += (*s as f32) / (i16::MAX as f32);
                    }
                    dst.samples.push(acc / channels as f32);
                }
            },
            err_fn,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &config.into(),
            move |data: &[u16], _| {
                let mut dst = buf_cb.lock();
                for frame in data.chunks(channels) {
                    let mut acc = 0f32;
                    for s in frame {
                        acc += (*s as f32 - 32768.0) / 32768.0;
                    }
                    dst.samples.push(acc / channels as f32);
                }
            },
            err_fn,
            None,
        ),
        fmt => {
            return Err(SttError::Capture(format!(
                "unsupported sample format: {fmt:?}"
            )))
        }
    }
    .map_err(|e| SttError::Capture(e.to_string()))?;

    stream
        .play()
        .map_err(|e| SttError::Capture(e.to_string()))?;
    Ok((stream, buf))
}

fn append_mono_f32(dst: &mut Vec<f32>, src: &[f32], channels: usize) {
    if channels == 1 {
        dst.extend_from_slice(src);
    } else {
        for frame in src.chunks(channels) {
            let sum: f32 = frame.iter().sum();
            dst.push(sum / channels as f32);
        }
    }
}

#[allow(deprecated)]
fn pick_input_device(host: &cpal::Host, preferred: Option<&str>) -> Option<cpal::Device> {
    if let Some(want) = preferred {
        if let Ok(devices) = host.input_devices() {
            for d in devices {
                if d.name().ok().as_deref() == Some(want) {
                    return Some(d);
                }
            }
            tracing::warn!(%want, "preferred input device not found; using default");
        }
    }
    host.default_input_device()
}

/// Enumerate audio devices so the UI can offer a picker.
/// Returned tuple: (input_device_names, output_device_names, default_input,
/// default_output).
#[allow(deprecated)]
pub fn list_devices() -> (Vec<String>, Vec<String>, Option<String>, Option<String>) {
    let host = cpal::default_host();
    let inputs: Vec<String> = host
        .input_devices()
        .map(|it| it.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default();
    let outputs: Vec<String> = host
        .output_devices()
        .map(|it| it.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default();
    let def_in = host.default_input_device().and_then(|d| d.name().ok());
    let def_out = host.default_output_device().and_then(|d| d.name().ok());
    (inputs, outputs, def_in, def_out)
}

/// Linear resampler. Whisper wants 16 kHz; anything goes in.
fn resample_to_16k(input: &[f32], input_rate: u32) -> Vec<f32> {
    const TARGET: u32 = 16_000;
    if input_rate == TARGET {
        return input.to_vec();
    }
    let ratio = input_rate as f64 / TARGET as f64;
    let out_len = (input.len() as f64 / ratio) as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src = i as f64 * ratio;
        let idx = src.floor() as usize;
        let frac = src - idx as f64;
        let a = input.get(idx).copied().unwrap_or(0.0);
        let b = input.get(idx + 1).copied().unwrap_or(a);
        out.push(a + (b - a) * frac as f32);
    }
    out
}

// ---------- Transcriber ----------

#[cfg(feature = "stt")]
#[path = "whisper.rs"]
mod whisper;

/// Run inference on 16 kHz mono f32 samples and return the recognized text.
/// Without the `stt` feature this always returns `NotAvailable`.
pub fn transcribe(model_path: &Path, samples: &[f32]) -> Result<String, SttError> {
    #[cfg(feature = "stt")]
    {
        whisper::transcribe_impl(model_path, samples)
    }
    #[cfg(not(feature = "stt"))]
    {
        let _ = (model_path, samples);
        Err(SttError::NotAvailable)
    }
}

pub fn is_available() -> bool {
    cfg!(feature = "stt")
}

#[allow(dead_code)]
pub type WhisperModelPath = PathBuf;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resample_identity() {
        let input = vec![0.1, -0.1, 0.2, -0.2];
        let out = resample_to_16k(&input, 16_000);
        assert_eq!(out, input);
    }

    #[test]
    fn resample_downsamples_length() {
        let input = vec![0.0f32; 48_000];
        let out = resample_to_16k(&input, 48_000);
        assert!(out.len() <= 16_000);
        assert!(out.len() >= 15_000);
    }
}
