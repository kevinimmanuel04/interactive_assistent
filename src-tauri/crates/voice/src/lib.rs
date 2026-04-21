//! Voice subsystem: STT (Whisper.cpp), TTS (Piper), VAD, wake word.
//! Phase 1: Piper TTS only. Phase 2: STT + VAD + lip-sync + interruptible TTS + wake word.

pub mod tts {
    //! Piper TTS (Phase 1). Placeholder.
    #[derive(thiserror::Error, Debug)]
    pub enum TtsError {
        #[error("tts not initialized")]
        NotInitialized,
    }
}

pub mod stt {
    //! Whisper.cpp STT (Phase 2). Placeholder.
}

pub mod vad {
    //! Voice activity detection (Phase 2). Placeholder.
}

pub mod wake {
    //! openWakeWord integration (Phase 2). Placeholder.
}
