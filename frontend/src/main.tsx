import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import { initSentry } from './lib/sentry';
import { initMixpanel } from './lib/mixpanel';
import App from './App.tsx';

// Init Sentry FIRST so unhandled errors during the rest of bootstrap
// (Kinde provider, lazy chunk loads, etc.) are captured. No-op when
// VITE_SENTRY_DSN isn't set, so local dev runs normally.
initSentry();

// Mixpanel right after — also a no-op when VITE_MIXPANEL_TOKEN is
// unset. Order matters only insofar as we want Sentry to capture any
// init-time Mixpanel error; both are otherwise independent.
initMixpanel();

if (!import.meta.env.VITE_KINDE_DOMAIN || !import.meta.env.VITE_KINDE_CLIENT_ID) {
  throw new Error(
    'Missing Kinde configuration. Copy frontend/.env.example to frontend/.env.local and set ' +
      'VITE_KINDE_DOMAIN and VITE_KINDE_CLIENT_ID from your Kinde Dashboard → Applications → Futuros FE.',
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
