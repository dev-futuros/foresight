/**
 * Single source of truth for supported languages.
 *
 * <p>To add a new language to the app:
 *   1. Drop `src/i18n/locales/<code>.ts` (start by copying es.ts and
 *      translating the values).
 *   2. Add one entry to {@link LANGUAGES} below.
 *
 * That's it. Picker dropdowns, dashboard badges, export/share modals,
 * type unions, and locale registration all pick the new language up
 * automatically.
 *
 * <p>This file is intentionally tiny and dependency-free — every other
 * piece of localisation infrastructure (the locale-file auto-discover
 * in `./index.ts`, the modals that render language pickers, the PDF/
 * HTML/PPT exporters) imports from here so the registry stays the
 * only place that knows what languages exist.
 */

export const LANGUAGES = {
  es: { code: 'es', label: 'Español', dateLocale: 'es-ES' },
  en: { code: 'en', label: 'English', dateLocale: 'en-GB' },
  ca: { code: 'ca', label: 'Català', dateLocale: 'ca-ES' },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;

export type LanguageSpec = (typeof LANGUAGES)[LanguageCode];

/** All supported language codes, in registration order. */
export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGES) as readonly LanguageCode[];

/** Default + i18next fallbackLng. */
export const DEFAULT_LANGUAGE: LanguageCode = 'es';

/** Type guard for narrowing arbitrary input (URL params, stored values, etc.). */
export function isLanguageCode(x: unknown): x is LanguageCode {
  return typeof x === 'string' && x in LANGUAGES;
}

/** Resolve a code (or unknown input) to the spec; returns the default
 *  language's spec when the code isn't recognised. Convenient for
 *  consumers that want to read .dateLocale / .label without
 *  conditional narrowing at the call site. */
export function languageSpec(code: unknown): LanguageSpec {
  return isLanguageCode(code) ? LANGUAGES[code] : LANGUAGES[DEFAULT_LANGUAGE];
}
