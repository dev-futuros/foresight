import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ca from './locales/ca';
import en from './locales/en';
import es from './locales/es';

// Simple init — hardcoded default + fallback. No URL/cookie/localStorage
// detection in the app right now. Language is changed explicitly via the
// account preferences screen (which calls i18n.changeLanguage and PATCH
// /users/me).
//
// Three first-class languages: Spanish (default + fallback), English, and
// Catalan. Any missing key in `ca` or `en` falls back to `es` per
// `fallbackLng` so partial translations degrade gracefully.
i18n.use(initReactI18next).init({
  resources: {
    ca: { translation: ca },
    en: { translation: en },
    es: { translation: es },
  },
  lng: 'es',
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

export default i18n;
