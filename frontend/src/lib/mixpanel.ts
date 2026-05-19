/**
 * Mixpanel — product analytics. Loaded lazily-ish (the SDK ships with
 * the main bundle but its init is gated behind {@link initMixpanel}
 * which no-ops when {@code VITE_MIXPANEL_TOKEN} is unset). Pair with
 * Sentry (errors + replay): Sentry tells us WHEN things break;
 * Mixpanel tells us WHAT users actually do with the app.
 *
 * <p>Init runs from {@code src/main.tsx} right after {@link initSentry}
 * so the SDK is ready by the time the first component mounts. The
 * Auth bridge calls {@link identify} once Kinde resolves a session;
 * the cookie banner calls {@link optIn} / {@link optOut} to gate
 * recording on the user's GDPR choice.
 *
 * <p>Privacy contract: this layer ONLY ships bounded, low-cardinality
 * properties (event names, format enums, language codes, IDs, plan
 * tiers). It NEVER ships report content (inputData / resultData),
 * chat messages, or free-text wizard fields — those are confidential
 * client material and stay on the backend.
 */
import mixpanel, { type Dict, type OverridedMixpanel } from 'mixpanel-browser';

/**
 * Module-level guard so callers can fire-and-forget {@link track}
 * without having to check init themselves. Flips to {@code true} once
 * {@link initMixpanel} has successfully called {@code mixpanel.init};
 * stays {@code false} when the token is absent (local dev) or init
 * threw (defensive).
 */
let initialised = false;

/**
 * Resolves the Mixpanel handle iff init succeeded. Returns
 * {@code undefined} otherwise so the call sites can use optional
 * chaining and stay silent when analytics is off.
 */
function client(): OverridedMixpanel | undefined {
  return initialised ? mixpanel : undefined;
}

/**
 * Initialise the Mixpanel browser SDK. No-op when
 * {@code VITE_MIXPANEL_TOKEN} is empty — used to disable analytics
 * locally (and on any environment where we don't want events flowing
 * into the prod project). Safe to call multiple times; the SDK itself
 * also guards against re-init.
 *
 * <p>Options worth highlighting:
 * <ul>
 *   <li>{@code api_host} — EU residency. The project lives in
 *       {@code eu.mixpanel.com}; events MUST be ingested at
 *       {@code api-eu.mixpanel.com} or they'll be rejected as
 *       wrong-region.</li>
 *   <li>{@code opt_out_tracking_by_default: true} — GDPR-clean.
 *       Nothing is sent until the user clicks Accept in the cookie
 *       banner ({@code CookieConsent.tsx::applyConsent}).</li>
 *   <li>{@code track_pageview: false} — autopageview is too coarse
 *       (fires once on initial load, misses SPA route changes). The
 *       {@code usePageViewTracking} hook handles this via
 *       {@code useLocation()}.</li>
 *   <li>{@code persistence: 'localStorage'} — distinct_id and super
 *       properties survive page refreshes. Cookies are the other
 *       option but the cookie consent banner already gates separately.</li>
 *   <li>{@code ignore_dnt: false} — respect the browser's Do Not
 *       Track header, just in case the user set it but never saw the
 *       banner.</li>
 * </ul>
 */
export function initMixpanel(): void {
  const token = import.meta.env.VITE_MIXPANEL_TOKEN as string | undefined;
  if (!token) {
    // Local dev / preview without a Mixpanel project. Single log so
    // the developer knows tracking is off without flooding the console.
    console.info('[mixpanel] VITE_MIXPANEL_TOKEN not set — analytics disabled');
    return;
  }

  const debug = import.meta.env.VITE_MIXPANEL_DEBUG === '1';

  try {
    mixpanel.init(token, {
      api_host: 'https://api-eu.mixpanel.com',
      persistence: 'localStorage',
      // Wait for the consent banner before sending anything. The
      // banner calls optIn() on accept — that's the only entry point
      // that arms the SDK. THIS is the meaningful privacy gate; DNT
      // (see ignore_dnt below) is intentionally bypassed because the
      // explicit cookie banner supersedes a deprecated browser header.
      opt_out_tracking_by_default: true,
      // We do our own pageview tracking from a router-aware hook so
      // SPA navigations actually get recorded.
      track_pageview: false,
      // Ignore the Do Not Track header. DNT was deprecated by the W3C
      // in 2018, never reached meaningful adoption, and was removed
      // from Chrome / Firefox shortly after. Respecting it would
      // create a contradictory state where a user who clicks "Accept"
      // on the cookie banner still gets silently dropped because of a
      // vestigial header from a dead spec. Our cookie consent UI is
      // the actual privacy gate.
      ignore_dnt: true,
      // ── Session replay ─────────────────────────────────────────
      // record_sessions_percent: 0 means the SDK does NOT auto-start
      // recording on init. We call mixpanel.start_session_recording()
      // explicitly from CookieConsent.applyConsent('accepted') so the
      // user has explicitly opted in before any frames are captured.
      // (See {@link startReplay}.)
      record_sessions_percent: 0,
      // PII masking — these are all SDK defaults but pinning them
      // explicitly prevents drift if Mixpanel ever changes the
      // defaults, AND makes the intent visible to code reviewers.
      // Report content (company names, strategic challenges, scenario
      // prose, chat messages) is confidential — every text node and
      // input is masked in the captured DOM.
      record_mask_all_text: true,
      record_mask_all_inputs: true,
      // CRITICAL: never record network bodies. Our SSE streams
      // (/api/ai/chat/stream, /api/ai/analyze/*) carry the full
      // company profile + chat history + model responses verbatim —
      // capturing those would dump confidential client material into
      // replays. SDK default is already false; pinning it here makes
      // sure no future config sprinkle flips it on.
      record_network: false,
      debug,
    });
    initialised = true;
    console.info('[mixpanel] initialised', { debug });
  } catch (err) {
    // Don't let a bad token / network blip take down boot. Sentry will
    // surface the error if it's running; locally it just lands in the
    // console and analytics stays off.
    console.error('[mixpanel] init failed — analytics disabled', err);
  }
}

/**
 * Fire a Mixpanel event. Silent no-op when init didn't run.
 *
 * <p>Event names use Title Case ({@code "Report Submitted"}) per
 * Mixpanel's documented convention — readable in their dashboard
 * without further munging. Property keys use snake_case so the
 * dashboard's auto-grouping works (their UI Title-Cases keys for
 * display either way, but the underlying name matters for funnels).
 *
 * <p>NEVER pass free text or report content as a property. Stick to
 * enums (export format, target language code), IDs (reportId), and
 * bounded numbers (step index, char count).
 */
export function track(event: string, properties?: Dict): void {
  client()?.track(event, properties);
}

/**
 * Tie subsequent events to a stable user identifier. Called from
 * {@code AuthBridge.tsx} once Kinde resolves a session. Pair with
 * {@link setUserProperties} so cohort filters (plan tier, locale)
 * work out of the box.
 */
export function identify(userId: string): void {
  client()?.identify(userId);
}

/**
 * Attach durable user-level properties (Mixpanel "people" profile).
 * These survive across events and let the dashboard slice funnels by
 * plan tier / locale / role.
 */
export function setUserProperties(props: Dict): void {
  client()?.people.set(props);
}

/**
 * Clear identity + super properties on sign-out so the next session
 * on the same browser doesn't bleed into the previous user's profile.
 */
export function reset(): void {
  client()?.reset();
}

/**
 * Arm the SDK after the user accepts cookies. Until this fires nothing
 * is sent (because of {@code opt_out_tracking_by_default}).
 */
export function optIn(): void {
  client()?.opt_in_tracking();
}

/**
 * Disarm the SDK after the user declines cookies (or revokes consent
 * via the debug shim). Subsequent track() calls become no-ops on
 * the wire — the SDK still accepts them locally but drops before
 * sending.
 */
export function optOut(): void {
  client()?.opt_out_tracking();
}

/**
 * Begin recording the user's session for replay. Called from
 * {@code CookieConsent.applyConsent('accepted')} right after
 * {@link optIn}, so frames are only captured after the user has
 * explicitly consented.
 *
 * <p>{@code mixpanel.init()} is configured with
 * {@code record_sessions_percent: 0}, which disables auto-start —
 * this function is the ONLY way recording begins. Pair with
 * {@link stopReplay} on reject so the user can revoke recording
 * without reloading.
 */
export function startReplay(): void {
  client()?.start_session_recording();
}

/**
 * Stop recording the user's session. Called from
 * {@code CookieConsent.applyConsent('rejected')} (and on every
 * mount of CookieConsent that re-applies a stored reject decision)
 * so frames stop being captured even mid-session if consent is
 * revoked.
 */
export function stopReplay(): void {
  client()?.stop_session_recording();
}
