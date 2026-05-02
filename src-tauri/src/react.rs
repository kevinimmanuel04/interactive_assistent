//! Neural-driven, multilingual, mode-aware in-character reactions.
//!
//! Used by `speak_reaction` (and any other "say something cute right now"
//! call site) to produce a single short line spoken by the avatar. The
//! goal is to feel like a genuine anime-girl companion: every tap, drag,
//! or idle moment gets a fresh, contextual reply rather than one of
//! four hardcoded strings.
//!
//! Routing mirrors the chat pipeline:
//!   * `Mode::Cloud` → OpenRouter (small classifier model, 4 s timeout).
//!   * `Mode::Local` → local llama.cpp (consume short stream).
//!   * `Mode::Auto`  → cloud if a key is set, else local.
//!
//! On timeout, error, or empty output we fall back to a canned localized
//! line so the user always hears *something* — no silent taps.

use std::time::Duration;

use futures::StreamExt;
use komorebi_cloud::OpenRouterClient;
use komorebi_llm::{default_engine, LlmConfig, LlmEvent};
use komorebi_router::{ChatMessage, Mode};
use tauri::{AppHandle, Wry};

use crate::settings;

/// Hard cap on how long we wait for any single reaction generation —
/// taps need to feel instant, so 4 s is the absolute upper bound; in
/// practice cloud comes back in ~600 ms, local in ~1.5 s.
const REACTION_TIMEOUT: Duration = Duration::from_secs(4);

/// `kind` strings recognised by [`generate`]. Frontend may pass anything;
/// unknown values fall through to the generic "you poked me" prompt.
pub mod kinds {
    pub const HEAD: &str = "head";
    pub const BODY: &str = "body";
    pub const HAND: &str = "hand";
    pub const DRAG: &str = "drag";
    pub const IDLE: &str = "idle";
}

/// Generate one in-character reaction line. Always returns *something*
/// — either an LLM completion or a canned localized line.
pub async fn generate(app: &AppHandle<Wry>, kind: &str) -> String {
    let lang = lang_hint(app);
    let messages = build_messages(kind, &lang);
    let mode = settings::get_mode(app);
    let route = resolve_route(app, mode);

    let llm = match tokio::time::timeout(REACTION_TIMEOUT, dispatch(app, route, &messages)).await {
        Ok(Ok(s)) => Some(s),
        Ok(Err(e)) => {
            tracing::debug!(?e, kind, "react: LLM call failed, using canned fallback");
            None
        }
        Err(_) => {
            tracing::debug!(kind, "react: LLM call timed out, using canned fallback");
            None
        }
    };

    let text = llm
        .map(|s| sanitize(&s))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| canned(kind, &lang));
    tracing::info!(kind, lang = %lang, len = text.chars().count(), "react: line ready");
    text
}

/// Best-effort UI / TTS language code. Matches the buckets used by the
/// canned-string fallback (`ru`, `ja`, `zh`, default `en`).
fn lang_hint(app: &AppHandle<Wry>) -> String {
    let raw = settings::public_snapshot(app).sovits_text_lang;
    match raw.as_str() {
        "ja" | "jp" => "ja".into(),
        "ru" => "ru".into(),
        "zh" => "zh".into(),
        "uk" => "uk".into(),
        _ => "en".into(),
    }
}

#[derive(Clone, Copy)]
enum Route {
    Cloud,
    Local,
}

fn resolve_route(app: &AppHandle<Wry>, mode: Mode) -> Route {
    match mode {
        Mode::Cloud => Route::Cloud,
        Mode::Local => Route::Local,
        Mode::Auto => {
            if settings::get_openrouter_key(app).is_some() {
                Route::Cloud
            } else {
                Route::Local
            }
        }
    }
}

async fn dispatch(
    app: &AppHandle<Wry>,
    route: Route,
    messages: &[ChatMessage],
) -> Result<String, String> {
    match route {
        Route::Cloud => run_cloud(app, messages).await,
        Route::Local => run_local(app, messages).await,
    }
}

async fn run_cloud(app: &AppHandle<Wry>, messages: &[ChatMessage]) -> Result<String, String> {
    let key = settings::get_openrouter_key(app).ok_or_else(|| "no openrouter key".to_string())?;
    // Reuse the cheap classifier model — 30 tokens is plenty.
    let model = settings::get_classifier_model(app);
    let client = OpenRouterClient::new(key).map_err(|e| e.to_string())?;
    client
        .complete(&model, messages, 40)
        .await
        .map_err(|e| e.to_string())
}

async fn run_local(app: &AppHandle<Wry>, messages: &[ChatMessage]) -> Result<String, String> {
    let mut cfg = LlmConfig::default();
    if let Some(p) = settings::get_local_model_path(app) {
        cfg.model_path = Some(std::path::PathBuf::from(p));
    }
    if let Some(n) = settings::get_gpu_layers(app) {
        cfg.n_gpu_layers = Some(n as i32);
    }
    let engine = default_engine(cfg);
    let mut stream = engine
        .stream_chat(messages)
        .await
        .map_err(|e| e.to_string())?;
    let mut acc = String::new();
    while let Some(evt) = stream.next().await {
        match evt {
            Ok(LlmEvent::Token(t)) => {
                acc.push_str(&t);
                // Hard cap: reactions should be ONE short line, never a
                // monologue. Bail once we have enough.
                if acc.chars().count() > 60 || acc.contains('\n') {
                    break;
                }
            }
            Ok(LlmEvent::Done) => break,
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(acc)
}

/// Build a (system, user) pair tuned for short, in-character output.
fn build_messages(kind: &str, lang: &str) -> Vec<ChatMessage> {
    let system = format!(
        "You are Mao, a cute, playful anime-girl desktop avatar. \
         Speak in FIRST PERSON as her. Always reply in language code '{lang}' \
         (ru = Russian, ja = Japanese, zh = Mandarin, uk = Ukrainian, en = English). \
         Output EXACTLY ONE short reaction line (max 8 words). \
         No quotes, no emoji, no narration, no stage directions, no asterisks. \
         Match the mood of the situation. Vary phrasing — never repeat yourself."
    );
    let user = match kind {
        kinds::HEAD => "The user just patted my head gently. React.",
        kinds::BODY => "The user just poked my body. React with mild surprise.",
        kinds::HAND => {
            "The user touched my hand — the one holding my paint brush. React playfully."
        }
        kinds::DRAG => "The user is dragging my window across the screen. React.",
        kinds::IDLE => "I have been idle for a while. Say a short cute thought to myself.",
        _ => "The user interacted with me somehow. React briefly.",
    };
    vec![ChatMessage::system(system), ChatMessage::user(user)]
}

/// Strip markdown, quotes, mood-tags and clip to a single line.
fn sanitize(raw: &str) -> String {
    let cleaned = raw
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("")
        .trim()
        .trim_matches(|c: char| matches!(c, '"' | '\'' | '“' | '”' | '«' | '»' | '*' | '`'));
    // Drop any leading "[mood:...]" or "(action)" prefix the model might add.
    let cleaned = strip_mood_prefix(cleaned);
    cleaned.trim().to_string()
}

fn strip_mood_prefix(s: &str) -> &str {
    let trimmed = s.trim_start();
    if let Some(rest) = trimmed.strip_prefix('[') {
        if let Some(end) = rest.find(']') {
            return rest[end + 1..].trim_start();
        }
    }
    if let Some(rest) = trimmed.strip_prefix('(') {
        if let Some(end) = rest.find(')') {
            return rest[end + 1..].trim_start();
        }
    }
    trimmed
}

/// Localized canned fallback. Picked pseudo-randomly by current time so
/// even the offline path doesn't repeat the same line back-to-back.
fn canned(kind: &str, lang: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let pool: &[&str] = match (kind, lang) {
        ("head", "ru") => &[
            "Эй, щекотно!",
            "Ты меня гладишь?",
            "Хе-хе.",
            "Не трогай волосы~",
        ],
        ("head", "uk") => &[
            "Гей, лоскотно!",
            "Ти мене гладиш?",
            "Хі-хі.",
            "Не чіпай волосся~",
        ],
        ("head", "ja") => &[
            "ふふっ、なでなで？",
            "きゃっ、くすぐったい！",
            "もっと撫でて〜",
            "えへへ♪",
        ],
        ("head", "zh") => &["嘿嘿，好痒~", "摸摸头~", "再来一下嘛", "嗯~舒服"],
        ("head", _) => &[
            "Hey, that tickles!",
            "Are you petting me?",
            "Hehe.",
            "Careful with the hair!",
        ],
        ("body", "ru") => &["Ой!", "Эй, полегче!", "Ты чего?", "Хи-хи."],
        ("body", "uk") => &["Ой!", "Гей, обережно!", "Ти що?", "Хі-хі."],
        ("body", "ja") => &["きゃっ！", "もう〜", "どうしたの？", "ふふっ"],
        ("body", "zh") => &["哎呀！", "干嘛啦~", "讨厌~", "嘻嘻"],
        ("body", _) => &["Oh!", "Hey, easy!", "What are you doing?", "Hee hee."],
        ("hand", "ru") => &[
            "Хочешь, нарисую тебе что-нибудь?",
            "Моя кисточка~",
            "Сейчас будет искусство!",
            "Подержи кисть.",
        ],
        ("hand", "uk") => &[
            "Хочеш, намалюю щось?",
            "Мій пензлик~",
            "Зараз буде мистецтво!",
            "Потримай пензля.",
        ],
        ("hand", "ja") => &[
            "絵を描いてあげようか？",
            "私の筆だよ〜",
            "アートの時間〜",
            "そっと触ってね",
        ],
        ("hand", "zh") => &["要我画一幅吗？", "我的画笔~", "艺术时间！", "轻轻拿着哦"],
        ("hand", _) => &[
            "Want me to draw you something?",
            "My brush~",
            "Art time!",
            "Hold the brush gently.",
        ],
        ("drag", "ru") => &[
            "Ой, кружится голова!",
            "Куда мы летим?",
            "Эй, не тряси меня!",
            "Меня укачало~",
        ],
        ("drag", "uk") => &[
            "Ой, голова крутиться!",
            "Куди ми летимо?",
            "Гей, не труси мене!",
            "Мене заколисало~",
        ],
        ("drag", "ja") => &[
            "わわっ、目が回る！",
            "どこに連れていくの？",
            "揺らさないで〜",
            "酔いそう…",
        ],
        ("drag", "zh") => &["哇，头晕！", "要带我去哪？", "别摇我啦~", "我要晕了…"],
        ("drag", _) => &[
            "Whoa, dizzy!",
            "Where are we going?",
            "Stop shaking me!",
            "I'm getting carsick~",
        ],
        ("idle", "ru") => &[
            "Хм... о чём бы подумать?",
            "Тихо как...",
            "Ты ещё тут?",
            "Скучно~",
        ],
        ("idle", "uk") => &[
            "Хм... про що б подумати?",
            "Як тихо...",
            "Ти ще тут?",
            "Нудно~",
        ],
        ("idle", "ja") => &[
            "うーん、何しようかな",
            "しーん…",
            "まだいる？",
            "ひまだなぁ",
        ],
        ("idle", "zh") => &["嗯…在想什么呢", "好安静…", "你还在吗？", "好无聊~"],
        ("idle", _) => &[
            "Hmm, what to think about...",
            "So quiet...",
            "Still there?",
            "Bored~",
        ],
        (_, "ru") => &["Да?", "Что такое?", "Я тут."],
        (_, "uk") => &["Так?", "Що таке?", "Я тут."],
        (_, "ja") => &["はい？", "なに？", "ここだよ〜"],
        (_, "zh") => &["嗯？", "怎么了？", "我在这里"],
        _ => &["Yes?", "What's up?", "I'm here."],
    };
    let idx = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as usize)
        .unwrap_or(0)
        % pool.len();
    pool[idx].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_quotes_and_brackets() {
        assert_eq!(sanitize("\"Hi there!\""), "Hi there!");
        assert_eq!(sanitize("[happy] So glad to see you"), "So glad to see you");
        assert_eq!(sanitize("(smiles) Welcome back"), "Welcome back");
        assert_eq!(sanitize("first line\nsecond line"), "first line");
        assert_eq!(sanitize("  «привет»  "), "привет");
    }

    #[test]
    fn canned_returns_non_empty_for_all_known_kinds() {
        for k in ["head", "body", "hand", "drag", "idle", "anything"] {
            for l in ["ru", "uk", "ja", "zh", "en"] {
                assert!(!canned(k, l).is_empty(), "kind={k} lang={l}");
            }
        }
    }

    #[test]
    fn build_messages_includes_lang_hint() {
        let msgs = build_messages("head", "ru");
        assert_eq!(msgs.len(), 2);
        let sys = format!("{:?}", msgs[0]);
        assert!(sys.contains("'ru'"));
    }
}
