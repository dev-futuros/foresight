import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import ca from './locales/ca';
import en from './locales/en';
import es from './locales/es';

// Language detection order:
//   1. `?lang=` query string — used by the homepage (futuros.io) to hand off
//      the user's language across the origin boundary into dev/app.futuros.io.
//   2. `futuros_lang` cookie scoped to `.futuros.io` — shared across the
//      marketing site (futuros.io), the dev app (dev.futuros.io), and prod
//      (app.futuros.io). The homepage sets this when the user picks a
//      language; the app reads it on first load so the Catalan choice the
//      user made on the marketing site carries through to the app shell
//      after the Kinde auth round-trip.
//   3. localStorage — caches the user's choice for return visits.
//   4. navigator.language — best guess for first-time direct visits.
//   5. fallbackLng — last resort.
//
// `caches: ['localStorage', 'cookie']` writes the resolved language back to
// both so other subdomains and return visits stay in sync.
//
// `fallbackLng: 'es'` matters because Catalan (`ca.ts`) only translates the
// auth namespace today — every other key falls through to the Spanish copy.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ca: { translation: ca },
      en: { translation: en },
      es: { translation: es },
    },
    fallbackLng: 'es',
    supportedLngs: ['ca', 'en', 'es'],
    nonExplicitSupportedLngs: true,
    detection: {
      order: ['querystring', 'cookie', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupCookie: 'futuros_lang',
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage', 'cookie'],
      cookieDomain: '.futuros.io',
      cookieMinutes: 60 * 24 * 365, // 1 year
      cookieOptions: { path: '/', sameSite: 'lax', secure: true },
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
