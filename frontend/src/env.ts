/**
 * Validated runtime configuration sourced from {@code VITE_*} env vars.
 *
 * <p>Single chokepoint so callers never reach for {@code import.meta.env}
 * directly (the ad-hoc {@code as string} casts that pattern produces are a
 * lie — Vite types missing vars as {@code string | undefined}, and the cast
 * hides the case where the var is empty). Required vars are validated
 * eagerly when this module is first loaded; optional vars are exposed as
 * {@code string | undefined} so callers can no-op on absence.
 *
 * <p>Import order matters: {@code main.tsx} imports this module BEFORE
 * calling {@code initSentry} / {@code initMixpanel}, so a missing
 * required var aborts boot with a clear local error rather than emitting
 * a useless Sentry event from a half-initialised app. Once the required
 * vars are validated, every other module imports {@code env} (not
 * {@code import.meta.env}) and gets a typed, narrowed value.
 */

const raw = import.meta.env;

function requireString(name: keyof ImportMetaEnv): string {
  const value = raw[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `Missing required env var ${name}. Copy frontend/.env.example to ` +
        `frontend/.env.local and set VITE_KINDE_DOMAIN and VITE_KINDE_CLIENT_ID ` +
        `from your Kinde Dashboard → Applications → Futuros FE.`,
    );
  }
  return value;
}

function optionalString(name: keyof ImportMetaEnv): string | undefined {
  const value = raw[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export const env = {
  kinde: {
    domain: requireString('VITE_KINDE_DOMAIN'),
    clientId: requireString('VITE_KINDE_CLIENT_ID'),
    /** Falls back to {@code `${origin}/callback`} at the call site. */
    redirectUri: optionalString('VITE_KINDE_REDIRECT_URI'),
    /** Falls back to {@code origin} at the call site. */
    logoutUri: optionalString('VITE_KINDE_LOGOUT_REDIRECT_URI'),
  },
  sentry: {
    /** Absent → Sentry init is a no-op. */
    dsn: optionalString('VITE_SENTRY_DSN'),
    /** Absent → Sentry tag falls back to {@code import.meta.env.MODE}. */
    environment: optionalString('VITE_SENTRY_ENVIRONMENT'),
    /** Absent → Sentry omits the release tag. */
    appVersion: optionalString('VITE_APP_VERSION'),
  },
  mixpanel: {
    /** Absent → Mixpanel init is a no-op. */
    token: optionalString('VITE_MIXPANEL_TOKEN'),
    /** Coerce the string {@code "1"} into a real boolean. */
    debug: raw.VITE_MIXPANEL_DEBUG === '1',
  },
} as const;
