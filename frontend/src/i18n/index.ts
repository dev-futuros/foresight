import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type LanguageCode } from './languages';

// Locale files are discovered automatically — drop `src/i18n/locales/<code>.ts`
// and register `<code>` in ./languages.ts. No edit here required.
//
// Vite resolves this glob at build time, so the registry is statically
// known to the bundler (each locale becomes a normal chunk, not a
// runtime fetch).
const localeModules = import.meta.glob<{ default: Record<string, unknown> }>(
  './locales/*.ts',
  { eager: true },
);

const resources = Object.fromEntries(
  Object.entries(localeModules).map(([path, mod]) => {
    const match = /\/locales\/([a-z]{2})\.ts$/.exec(path);
    if (!match) {
      throw new Error(`Locale filename doesn't match /locales/<code>.ts: ${path}`);
    }
    const code = match[1] as LanguageCode;
    return [code, { translation: mod.default }];
  }),
);

// Sanity checks: every registered code has a file, and every file has
// an entry. Fail loudly at startup rather than silently falling back
// to the default language when a registration is missing.
for (const code of SUPPORTED_LANGUAGES) {
  if (!resources[code]) {
    throw new Error(
      `Missing locale file for language "${code}". Drop src/i18n/locales/${code}.ts ` +
        `or remove the entry from src/i18n/languages.ts.`,
    );
  }
}
for (const code of Object.keys(resources)) {
  if (!SUPPORTED_LANGUAGES.includes(code as LanguageCode)) {
    throw new Error(
      `Orphan locale file: src/i18n/locales/${code}.ts has no entry in ` +
        `src/i18n/languages.ts. Add it or delete the file.`,
    );
  }
}

// Simple init — hardcoded default + fallback. No URL/cookie/localStorage
// detection in the app right now. Language is changed explicitly via the
// AccountModal (which calls i18n.changeLanguage and PATCH /users/me).
//
// Cross-subdomain language handoff (futuros.io → dev/app.futuros.io) is
// intentionally NOT done here. The marketing site + Kinde-hosted auth
// pages own the language picking; the app picks up whatever was last set
// via the AccountModal or stays on the default.
i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
});

export default i18n;
