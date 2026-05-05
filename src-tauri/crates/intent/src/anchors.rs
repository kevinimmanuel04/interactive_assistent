//! Multilingual phrase anchors for each intent. The classifier embeds
//! these once at engine init; query embeddings are scored vs the per-
//! intent anchor set with cosine similarity (max-pool).
//!
//! Anchors should be diverse and natural — not just keyword lists. They
//! cover the way real users phrase the request in RU/EN/UK, including
//! synonyms and inflected forms that the old substring matchers missed.
//!
//! When you add a new intent: keep at least 6–8 anchors, and prefer
//! short, declarative phrases over long sentences (MiniLM works best on
//! ≤32-token utterances).

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Intent {
    /// Plain conversation / question — default fallback.
    Chat,
    /// Weather query: "какая сегодня погода в Киеве?", "температура?".
    Weather,
    /// Image generation: "нарисуй закат", "сгенерируй кота".
    ImageGen,
    /// Volume control: "сделай громче", "mute".
    Volume,
    /// Screenshot/screen-capture command.
    Screenshot,
    /// Clipboard read / copy / paste.
    Clipboard,
    /// Launch an app or open a URL.
    Open,
    /// Media playback (next/prev/pause/play).
    Media,
}

impl Intent {
    /// All non-chat intents in registry order.
    pub const SKILL_INTENTS: &'static [Intent] = &[
        Intent::Weather,
        Intent::ImageGen,
        Intent::Volume,
        Intent::Screenshot,
        Intent::Clipboard,
        Intent::Open,
        Intent::Media,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Intent::Chat => "chat",
            Intent::Weather => "weather",
            Intent::ImageGen => "imagegen",
            Intent::Volume => "volume",
            Intent::Screenshot => "screenshot",
            Intent::Clipboard => "clipboard",
            Intent::Open => "open",
            Intent::Media => "media",
        }
    }

    /// Map an action-taking intent to the registered
    /// [`komorebi_skills`] skill name. Non-skill intents return `None`.
    pub fn skill_name(self) -> Option<&'static str> {
        match self {
            Intent::Volume => Some("volume"),
            Intent::Screenshot => Some("screenshot"),
            Intent::Clipboard => Some("clipboard"),
            Intent::Open => Some("open"),
            Intent::Media => Some("media"),
            Intent::Chat | Intent::Weather | Intent::ImageGen => None,
        }
    }

    /// Anchor phrases used to define this intent in embedding space.
    /// Phrases are kept short and declarative; mix of RU/EN/UK to
    /// cover the trilingual UX. Add more freely — runtime cost is a
    /// one-time embed at engine init.
    pub fn anchors(self) -> &'static [&'static str] {
        match self {
            Intent::Chat => &[],
            Intent::Weather => &[
                "какая сегодня погода",
                "погода в Киеве",
                "погода на завтра",
                "сколько градусов на улице",
                "какая температура сейчас",
                "будет ли дождь",
                "прогноз на выходные",
                "what is the weather today",
                "weather in London tomorrow",
                "is it raining outside",
                "temperature right now",
                "yaka pohoda zaraz",
                "яка температура надворі",
                "прогноз погоди на завтра",
            ],
            Intent::ImageGen => &[
                "нарисуй закат над морем",
                "сгенерируй картинку кота в шляпе",
                "сделай арт в стиле аниме",
                "создай иллюстрацию дракона",
                "draw a sunset over mountains",
                "generate an image of a robot",
                "make a picture of a cat",
                "render an illustration in anime style",
                "намалюй пейзаж лісу",
                "створи зображення вовка",
            ],
            Intent::Volume => &[
                "сделай громче",
                "увеличь громкость",
                "тише пожалуйста",
                "выключи звук",
                "поставь громкость на пятьдесят процентов",
                "make it louder",
                "turn down the volume",
                "mute the sound",
                "set volume to 30 percent",
                "зроби голосніше",
                "вимкни звук",
                "тихіше",
            ],
            Intent::Screenshot => &[
                "сделай скриншот",
                "сними экран",
                "снимок экрана",
                "скрин",
                "take a screenshot",
                "capture my screen",
                "screen grab please",
                "зроби скріншот",
                "знімок екрана",
            ],
            Intent::Clipboard => &[
                "что в буфере обмена",
                "покажи буфер",
                "скопируй это",
                "вставь",
                "what is in my clipboard",
                "show clipboard contents",
                "copy this text",
                "paste it",
                "що в буфері обміну",
                "вставь вміст",
            ],
            Intent::Open => &[
                "открой браузер",
                "запусти телеграм",
                "включи дискорд",
                "открой ютуб",
                "запусти калькулятор",
                "open chrome",
                "launch telegram",
                "start discord",
                "open youtube",
                "відкрий браузер",
                "запусти калькулятор",
                "увімкни дискорд",
            ],
            Intent::Media => &[
                "следующий трек",
                "поставь на паузу",
                "включи музыку",
                "переключи песню",
                "предыдущая",
                "next track",
                "pause the music",
                "play music",
                "skip song",
                "previous song",
                "наступна пісня",
                "зупини музику",
                "грай далі",
            ],
        }
    }
}
