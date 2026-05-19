import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
// Importing `env` first runs the required-var validation in src/env.ts
// at module-eval time, so a missing Kinde config aborts boot with a
// helpful local error BEFORE we'd waste a Sentry event from a
// half-initialised app.
import './env';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
