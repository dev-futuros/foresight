/**
 * Sentry initialisation for the frontend.
 *
 * <p>Called from {@code src/main.tsx} BEFORE React renders so unhandled
 * errors during bootstrap (lazy chunk loads, Kinde init, etc.) are
 * captured. When the DSN env var isn't set — local dev without a
 * Sentry project, ephemeral preview builds — {@link initSentry} is a
 * silent no-op so the app runs normally without phoning home.
 *
 * <p>Replay is configured "errors-only" by default: {@code
 * replaysSessionSampleRate: 0} means we never record a session
 * proactively, but {@code replaysOnErrorSampleRate: 1} means EVERY
 * captured error pulls along the preceding 60s of replay context. That
 * gives you the "what was the user doing right before the crash" view
 * without the cost (and privacy exposure) of recording every visit.
 *
 * <p>Replay is also CONSENT-GATED — see
 * {@code features/cookies/CookieConsent.tsx::applyConsent} which calls
 * {@code Sentry.getReplay()?.start() / .stop()} based on the user's
 * choice. Errors still capture without consent; only the screen-
 * recording replay needs an explicit opt-in.
 *
 * <p>PII scrubbing: report content (inputData, resultData, etc.) is
 * confidential client information. {@link beforeSend} strips obvious
 * leak paths from event payloads; the replay masking integration
 * masks every {@code <input>} and text node by default so screen
 * recordings never capture report prose.
 */
import * as Sentry from '@sentry/react';
import { env } from '../env';

export function initSentry(): void {
  const dsn = env.sentry.dsn;
  if (!dsn) {
    // Local dev / preview builds without a Sentry project. Logging once
    // at boot is enough for the developer to know capture is off.
    console.info('[sentry] VITE_SENTRY_DSN not set — error capture disabled');
    return;
  }

  const environment = env.sentry.environment ?? import.meta.env.MODE;
  const release = env.sentry.appVersion;

  Sentry.init({
    dsn,
    environment,
    release,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Mask everything by default. Report prose, company names,
        // strategic challenges are all confidential — opt INTO
        // capturing specific elements via the `unmask-*` CSS classes
        // if we ever decide that's the right tradeoff.
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    // Tracing: keep at 10% to start. Tune up after we have a baseline
    // for monthly transaction volume in the Sentry quota dashboard.
    tracesSampleRate: 0.1,
    // Replay: never record proactively; ALWAYS record when an error
    // fires (the SDK keeps a rolling buffer that backfills the
    // session-on-error). Consent gating in CookieConsent flips the
    // replay integration on/off at runtime.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    /**
     * Last-line PII scrubber. Drops obvious sources of report content
     * from event payloads. Returning {@code null} would drop the
     * entire event; we want to keep errors flowing, just without the
     * confidential bits.
     */
    beforeSend(event) {
      // Strip request bodies — our /api/ai/* endpoints carry the
      // entire company profile + STEEP context in their request body,
      // and Sentry's fetch-breadcrumb capture would include them
      // verbatim. The breadcrumb still tells us WHICH endpoint
      // failed, just not WHAT was sent.
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((b) => {
          if (b.category === 'fetch' || b.category === 'xhr') {
            // Drop body/data fields — keep url/method/status.
            const { data, ...rest } = b;
            void data;
            return rest;
          }
          return b;
        });
      }
      return event;
    },
  });

  console.info('[sentry] initialised', { environment, release });
}
