//! Voice subsystem: TTS (Piper) and STT (Whisper) in Phase 2;
//! VAD/wake word arrive in Phase 2D.

pub mod deepgram;
pub mod faster_whisper;
pub mod openrouter;
pub mod sovits;
pub mod stt;
pub mod tts;

pub mod vad {
    //! Voice activity detection (Phase 2D). Placeholder.
}

pub mod wake {
    //! openWakeWord integration (Phase 2D). Placeholder.
}
