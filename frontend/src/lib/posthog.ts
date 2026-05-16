/**
 * Thin typed wrapper around the global `window.posthog` installed by the PostHog
 * snippet in `index.html`. Centralising it here means callers don't have to
 * deal with the `any` global, and we can swap in a richer client (e.g. the
 * official `posthog-js` package) later without touching call sites.
 *
 * The snippet either installs the real PostHog (when `VITE_POSTHOG_KEY` is set
 * at build time) or a tiny no-op stub that swallows every call. So every
 * function exported here is safe to call unconditionally — there's no `if
 * (window.posthog)` dance required at call sites.
 */

interface PostHogJs {
  __disabled?: boolean;
  capture: (eventName: string, properties?: Record<string, unknown>) => void;
  identify: (
    distinctId: string,
    properties?: Record<string, unknown>,
    setOnce?: Record<string, unknown>,
  ) => void;
  reset: () => void;
  opt_in_capturing: () => void;
  opt_out_capturing: () => void;
  has_opted_in_capturing: () => boolean;
  has_opted_out_capturing: () => boolean;
}

declare global {
  interface Window {
    posthog?: PostHogJs;
  }
}

function ph(): PostHogJs | null {
  return typeof window !== 'undefined' && window.posthog ? window.posthog : null;
}

/** Returns true when PostHog is configured for this build (real SDK, not the stub). */
export function isEnabled(): boolean {
  const client = ph();
  return Boolean(client && !client.__disabled);
}

/** Fire a custom event. Safe to call before consent — capture is a no-op until opt-in. */
export function capture(eventName: string, properties?: Record<string, unknown>): void {
  ph()?.capture(eventName, properties);
}

/**
 * Tie subsequent events to a stable user id. The Clerk user id is the natural
 * choice — the backend's posthog-server SDK uses the same id as its
 * `distinct_id`, so backend `$ai_generation` events and frontend pageviews/
 * UI events line up on a single person in PostHog.
 */
export function identify(
  distinctId: string,
  properties?: Record<string, unknown>,
  setOnce?: Record<string, unknown>,
): void {
  ph()?.identify(distinctId, properties, setOnce);
}

/** Forget the current identity. Call on sign-out so the next session starts anonymous. */
export function reset(): void {
  ph()?.reset();
}

/** Flip capture on. Pair with a recorded consent decision in localStorage. */
export function optIn(): void {
  ph()?.opt_in_capturing();
}

/** Flip capture off. */
export function optOut(): void {
  ph()?.opt_out_capturing();
}

export function hasOptedIn(): boolean {
  return ph()?.has_opted_in_capturing() ?? false;
}

export function hasOptedOut(): boolean {
  return ph()?.has_opted_out_capturing() ?? false;
}
