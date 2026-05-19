/// <reference types="vite/client" />

/**
 * Typed schema of the project's {@code VITE_*} env vars. Vite types every
 * key as {@code string | undefined} regardless of presence — the canonical
 * required-vs-optional split lives in {@link ./env.ts}. This declaration
 * exists so {@code keyof ImportMetaEnv} narrows to the actual set we use.
 */
interface ImportMetaEnv {
  // ── Kinde (required) ───────────────────────────────────────────
  readonly VITE_KINDE_DOMAIN: string;
  readonly VITE_KINDE_CLIENT_ID: string;
  readonly VITE_KINDE_REDIRECT_URI?: string;
  readonly VITE_KINDE_LOGOUT_REDIRECT_URI?: string;

  // ── Sentry (all optional; absent → init no-ops) ────────────────
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_APP_VERSION?: string;

  // ── Mixpanel (all optional; absent → init no-ops) ──────────────
  readonly VITE_MIXPANEL_TOKEN?: string;
  /** Coerced to a boolean in {@link ./env.ts}: "1" → true, anything else → false. */
  readonly VITE_MIXPANEL_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
