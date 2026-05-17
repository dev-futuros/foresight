import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ca from './locales/ca';
import en from './locales/en';
import es from './locales/es';

// Simple init — hardcoded default + fallback. No URL/cookie/localStorage
// detection in the app right now. Language is changed explicitly via the
// AccountModal (which calls i18n.changeLanguage and PATCH /users/me).
//
// `ca` is registered as a resource so AccountModal's Catalan option works,
// but only the `auth.*` namespace is translated today — every other key
// falls back to Spanish per `fallbackLng`. Full-app Catalan is a separate
// follow-up task.
//
// Cross-subdomain language handoff (futuros.io → dev/app.futuros.io) is
// intentionally NOT done here. The marketing site + Kinde-hosted auth
// pages own the language picking; the app picks up whatever was last set
// via the AccountModal or stays on the default `es`.
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
