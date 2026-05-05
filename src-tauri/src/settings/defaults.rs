//! Default values exposed publicly so callers (especially the UI
//! snapshot) and other crates can reference the same constants used
//! during fall-through reads.

pub const DEFAULT_LANGUAGE: &str = "auto";

pub const DEFAULT_TELEMETRY_ENDPOINT: &str = "https://telemetry.komorebi.svitix.com/v1/feedback";

pub const DEFAULT_TRAINING_MAX_CPU_PCT: i64 = 50;
pub const DEFAULT_TRAINING_BATTERY_FLOOR_PCT: i64 = 40;
pub const DEFAULT_TRAINING_MIN_EXAMPLES: i64 = 100;
pub const DEFAULT_TRAINING_SCHEDULE: &str = "manual";

pub const DEFAULT_WEATHER_PROVIDER: &str = "openmeteo";
pub const DEFAULT_WEATHER_UNITS: &str = "metric";

pub const DEFAULT_RELATIONSHIP_VISIBILITY: &str = "indicator";

pub const DEFAULT_OPENROUTER_TTS_MODEL: &str = "openai/gpt-4o-audio-preview";
pub const DEFAULT_OPENROUTER_TTS_VOICE: &str = "shimmer";
pub const DEFAULT_OPENROUTER_STT_MODEL: &str = "openai/gpt-4o-audio-preview";

pub const DEFAULT_GAME_COACH_MODEL: &str = "openai/gpt-4o-mini";

pub const DEFAULT_FASTER_WHISPER_URL: &str = "http://localhost:8000";
pub const DEFAULT_FASTER_WHISPER_MODEL: &str = "Systran/faster-whisper-base";

pub const DEFAULT_DEEPGRAM_MODEL: &str = "nova-3";

pub const DEFAULT_IMAGEGEN_PROVIDER: &str = "openrouter";
pub const DEFAULT_IMAGEGEN_OR_MODEL: &str = "google/gemini-2.5-flash-image";
pub const DEFAULT_IMAGEGEN_REPLICATE_MODEL: &str = "black-forest-labs/flux-schnell";
pub const DEFAULT_IMAGEGEN_DEVICE: &str = "auto";
pub const DEFAULT_IMAGEGEN_WIDTH: i64 = 768;
pub const DEFAULT_IMAGEGEN_HEIGHT: i64 = 768;
pub const DEFAULT_IMAGEGEN_STEPS: i64 = 20;
