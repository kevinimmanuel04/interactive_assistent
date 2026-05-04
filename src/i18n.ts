// Light-weight i18n layer for Komorebi.
//
// No external library — three flat dictionaries (en/ru/uk) and a
// `t(key, params?)` helper. The active language is bootstrapped from
// the backend on startup (which resolves "auto" against the OS locale)
// and re-resolved whenever the user picks a new value in Settings.
//
// Usage:
//   import { t, useLocale } from "./i18n";
//   const locale = useLocale();
//   t("settings.title")
//   t("relationship.score", { score: 42 })

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type Locale = "en" | "ru" | "uk";

const FALLBACK: Locale = "en";

/* ---------- Dictionaries ----------------------------------------------- */

const EN = {
  // Top bar
  "topbar.listen.tip_setup": "Set up Whisper or enable OpenRouter STT first",
  "topbar.listen.tip_listening": "Listening — click to stop",
  "topbar.listen.tip_idle": "Continuous listen",
  "topbar.watch.tip_setup": "Add OpenRouter key first",
  "topbar.watch.tip_on": "Always-watch ON — every message attaches a screenshot",
  "topbar.watch.tip_off": "Always watch screen — toggle ON to attach screenshot to every message",
  "topbar.reset": "Reset conversation",
  "topbar.downloads": "Model downloads",
  "topbar.settings": "Settings",
  "topbar.quit": "Quit Komorebi",
  "topbar.no_key": "No OpenRouter key",
  "topbar.key_saved": "OpenRouter key saved",
  // Common
  "common.save": "Save",
  "common.clear": "Clear",
  "common.reset": "Reset",
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.test": "Test",
  "common.enable": "Enable",
  "common.disable": "Disable",
  // Settings — sections
  "settings.title": "Settings",
  "settings.language.title": "Language",
  "settings.language.hint": "Pick the language Komorebi answers in. Auto follows your OS locale.",
  "settings.language.auto": "Auto (system)",
  "settings.language.en": "English",
  "settings.language.ru": "Русский",
  "settings.language.uk": "Українська",
  // Weather
  "weather.title": "Weather",
  "weather.hint": "Komorebi can answer “погода в Берлине”, “/weather Tokyo”, or just “what's the weather”. Open-Meteo is free and needs no key.",
  "weather.provider": "Provider",
  "weather.provider.openmeteo": "Open-Meteo (free, no key)",
  "weather.provider.owm": "OpenWeatherMap (requires key)",
  "weather.api_key": "OpenWeatherMap API key",
  "weather.api_key.placeholder_saved": "(saved — leave blank)",
  "weather.api_key.placeholder_empty": "paste API key",
  "weather.default_city": "Default city (optional)",
  "weather.default_city.placeholder": "e.g. Berlin",
  "weather.use_ip": "Auto-detect city via IP when not specified",
  "weather.units": "Units",
  "weather.units.metric": "Metric (°C, m/s)",
  "weather.units.imperial": "Imperial (°F, mph)",
  // Relationship
  "rel.title": "Relationship",
  "rel.hint": "The assistant remembers how you treat her. Compliments, regular contact, and substantive conversation deepen affinity; rudeness and long silences pull it back. Stages alter tone, animations, and endearments.",
  "rel.your_name": "Your name (optional)",
  "rel.your_name.placeholder": "How should she call you?",
  "rel.visibility": "Indicator visibility",
  "rel.visibility.show": "Show heart badge in top bar",
  "rel.visibility.hide": "Hide indicator",
  "rel.decay": "Slowly decay affinity during inactivity (~1 pt/day)",
  "rel.nsfw": "Allow flirty/intimate replies at high stages",
  "rel.recent_events": "Recent events",
  "rel.reset.confirm": "Reset relationship state to Stranger?",
  "rel.reset.button": "Reset relationship",
  "rel.score": "{score} pts",
  "rel.interactions": "{count} interactions · streak {streak}d",
  "rel.stage_up": "Stage up",
  // Stage labels
  "stage.stranger": "Stranger",
  "stage.acquaintance": "Acquaintance",
  "stage.friend": "Friend",
  "stage.close": "Close",
  "stage.trusted": "Trusted",
  "stage.romantic": "Romantic",
  "stage.lover": "Lover",
};

type DictKey = keyof typeof EN;

const RU: Record<DictKey, string> = {
  "topbar.listen.tip_setup": "Сначала настройте Whisper или OpenRouter STT",
  "topbar.listen.tip_listening": "Слушаю — нажмите, чтобы остановить",
  "topbar.listen.tip_idle": "Постоянное прослушивание",
  "topbar.watch.tip_setup": "Сначала добавьте ключ OpenRouter",
  "topbar.watch.tip_on": "Авто-наблюдение ВКЛ — скриншот добавляется к каждому сообщению",
  "topbar.watch.tip_off": "Постоянно следить за экраном — включите, чтобы прикладывать скриншот",
  "topbar.reset": "Сбросить диалог",
  "topbar.downloads": "Загрузка моделей",
  "topbar.settings": "Настройки",
  "topbar.quit": "Закрыть Komorebi",
  "topbar.no_key": "Ключ OpenRouter не задан",
  "topbar.key_saved": "Ключ OpenRouter сохранён",
  "common.save": "Сохранить",
  "common.clear": "Очистить",
  "common.reset": "Сбросить",
  "common.close": "Закрыть",
  "common.cancel": "Отмена",
  "common.test": "Проверить",
  "common.enable": "Включить",
  "common.disable": "Выключить",
  "settings.title": "Настройки",
  "settings.language.title": "Язык",
  "settings.language.hint": "Выберите язык, на котором отвечает Komorebi. «Авто» следует за локалью системы.",
  "settings.language.auto": "Авто (система)",
  "settings.language.en": "English",
  "settings.language.ru": "Русский",
  "settings.language.uk": "Українська",
  "weather.title": "Погода",
  "weather.hint": "Komorebi отвечает на «погода в Берлине», «/weather Tokyo» или просто «какая сейчас погода». Open-Meteo бесплатно и без ключа.",
  "weather.provider": "Провайдер",
  "weather.provider.openmeteo": "Open-Meteo (бесплатно, без ключа)",
  "weather.provider.owm": "OpenWeatherMap (нужен ключ)",
  "weather.api_key": "API-ключ OpenWeatherMap",
  "weather.api_key.placeholder_saved": "(сохранён — оставьте пустым)",
  "weather.api_key.placeholder_empty": "вставьте API-ключ",
  "weather.default_city": "Город по умолчанию (опционально)",
  "weather.default_city.placeholder": "напр. Москва",
  "weather.use_ip": "Определять город по IP, если не указан",
  "weather.units": "Единицы",
  "weather.units.metric": "Метрические (°C, м/с)",
  "weather.units.imperial": "Имперские (°F, миль/ч)",
  "rel.title": "Отношения",
  "rel.hint": "Ассистент помнит, как вы общаетесь. Комплименты, регулярный контакт и содержательные разговоры повышают близость; грубость и долгие паузы — снижают. Уровни меняют тон, анимации и обращения.",
  "rel.your_name": "Ваше имя (опционально)",
  "rel.your_name.placeholder": "Как ей вас называть?",
  "rel.visibility": "Видимость индикатора",
  "rel.visibility.show": "Показывать значок в верхней панели",
  "rel.visibility.hide": "Скрыть индикатор",
  "rel.decay": "Медленно снижать близость при бездействии (~1 балл/день)",
  "rel.nsfw": "Разрешать игривые/интимные ответы на высоких уровнях",
  "rel.recent_events": "Последние события",
  "rel.reset.confirm": "Сбросить отношения до уровня «Незнакомец»?",
  "rel.reset.button": "Сбросить отношения",
  "rel.score": "{score} баллов",
  "rel.interactions": "взаимодействий: {count} · стрик {streak}д",
  "rel.stage_up": "Новый уровень",
  "stage.stranger": "Незнакомец",
  "stage.acquaintance": "Знакомый",
  "stage.friend": "Друг",
  "stage.close": "Близкий",
  "stage.trusted": "Доверенный",
  "stage.romantic": "Романтика",
  "stage.lover": "Любимый",
};

const UK: Record<DictKey, string> = {
  "topbar.listen.tip_setup": "Спершу налаштуйте Whisper або OpenRouter STT",
  "topbar.listen.tip_listening": "Слухаю — натисніть, щоб зупинити",
  "topbar.listen.tip_idle": "Постійне прослуховування",
  "topbar.watch.tip_setup": "Спершу додайте ключ OpenRouter",
  "topbar.watch.tip_on": "Авто-спостереження УВІМК — скриншот додається до кожного повідомлення",
  "topbar.watch.tip_off": "Постійно стежити за екраном — увімкніть, щоб додавати скриншот",
  "topbar.reset": "Скинути діалог",
  "topbar.downloads": "Завантаження моделей",
  "topbar.settings": "Налаштування",
  "topbar.quit": "Закрити Komorebi",
  "topbar.no_key": "Ключ OpenRouter не задано",
  "topbar.key_saved": "Ключ OpenRouter збережено",
  "common.save": "Зберегти",
  "common.clear": "Очистити",
  "common.reset": "Скинути",
  "common.close": "Закрити",
  "common.cancel": "Скасувати",
  "common.test": "Перевірити",
  "common.enable": "Увімкнути",
  "common.disable": "Вимкнути",
  "settings.title": "Налаштування",
  "settings.language.title": "Мова",
  "settings.language.hint": "Оберіть мову, якою спілкується Komorebi. «Авто» бере мову системи.",
  "settings.language.auto": "Авто (система)",
  "settings.language.en": "English",
  "settings.language.ru": "Русский",
  "settings.language.uk": "Українська",
  "weather.title": "Погода",
  "weather.hint": "Komorebi відповідає на «погода в Києві», «/weather Tokyo» або просто «яка зараз погода». Open-Meteo безкоштовно і без ключа.",
  "weather.provider": "Провайдер",
  "weather.provider.openmeteo": "Open-Meteo (безкоштовно, без ключа)",
  "weather.provider.owm": "OpenWeatherMap (потрібен ключ)",
  "weather.api_key": "API-ключ OpenWeatherMap",
  "weather.api_key.placeholder_saved": "(збережено — лишіть порожнім)",
  "weather.api_key.placeholder_empty": "вставте API-ключ",
  "weather.default_city": "Місто за замовчуванням (опційно)",
  "weather.default_city.placeholder": "напр. Київ",
  "weather.use_ip": "Визначати місто за IP, якщо не вказано",
  "weather.units": "Одиниці",
  "weather.units.metric": "Метричні (°C, м/с)",
  "weather.units.imperial": "Імперські (°F, миль/год)",
  "rel.title": "Стосунки",
  "rel.hint": "Асистентка пам’ятає, як ви до неї ставитесь. Компліменти, регулярний контакт і змістовні розмови підвищують близькість; грубість і довгі паузи — знижують. Рівні змінюють тон, анімації та звертання.",
  "rel.your_name": "Ваше ім’я (опційно)",
  "rel.your_name.placeholder": "Як їй до вас звертатись?",
  "rel.visibility": "Видимість індикатора",
  "rel.visibility.show": "Показувати значок у верхній панелі",
  "rel.visibility.hide": "Сховати індикатор",
  "rel.decay": "Повільно знижувати близькість під час бездіяльності (~1 бал/день)",
  "rel.nsfw": "Дозволяти грайливі/інтимні відповіді на високих рівнях",
  "rel.recent_events": "Останні події",
  "rel.reset.confirm": "Скинути стосунки до рівня «Незнайомець»?",
  "rel.reset.button": "Скинути стосунки",
  "rel.score": "{score} балів",
  "rel.interactions": "взаємодій: {count} · стрик {streak}д",
  "rel.stage_up": "Новий рівень",
  "stage.stranger": "Незнайомець",
  "stage.acquaintance": "Знайомий",
  "stage.friend": "Друг",
  "stage.close": "Близький",
  "stage.trusted": "Довірений",
  "stage.romantic": "Романтика",
  "stage.lover": "Коханий",
};

const DICTS: Record<Locale, Record<DictKey, string>> = { en: EN, ru: RU, uk: UK };

/* ---------- Runtime ---------------------------------------------------- */

let activeLocale: Locale = FALLBACK;
const listeners = new Set<(loc: Locale) => void>();

export function getLocale(): Locale {
  return activeLocale;
}

export function setLocale(loc: Locale) {
  if (loc === activeLocale) return;
  activeLocale = loc;
  for (const cb of listeners) cb(loc);
}

/** Pulls the resolved language from the backend (which honours "auto"). */
export async function bootstrapLocale(): Promise<Locale> {
  try {
    const lang = (await invoke<string>("get_resolved_language")) as Locale;
    if (lang === "ru" || lang === "uk" || lang === "en") {
      setLocale(lang);
      return lang;
    }
  } catch {
    /* fall through to fallback */
  }
  setLocale(FALLBACK);
  return FALLBACK;
}

export function t(key: DictKey, params?: Record<string, string | number>): string {
  const dict = DICTS[activeLocale] ?? DICTS[FALLBACK];
  let s = dict[key] ?? DICTS[FALLBACK][key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}

/** Subscribe a component to locale changes; returns the current locale. */
export function useLocale(): Locale {
  const [loc, set] = useState(activeLocale);
  useEffect(() => {
    const cb = (l: Locale) => set(l);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return loc;
}
