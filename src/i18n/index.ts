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

import { EN, type DictKey } from "./locales/en";
import { RU } from "./locales/ru";
import { UK } from "./locales/uk";

export type Locale = "en" | "ru" | "uk";
export type { DictKey };

const FALLBACK: Locale = "en";

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
