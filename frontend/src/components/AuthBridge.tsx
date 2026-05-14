import { useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { setTokenGetter } from '../lib/api';
import * as posthog from '../lib/posthog';

/**
 * Connects Clerk's session token to the standalone axios instance used across the app
 * and ties the active Clerk user id to PostHog as the analytics distinct_id.
 *
 * <p>Mounted once inside `<ClerkProvider>`, this component grabs the `getToken`
 * function from Clerk's `useAuth()` hook and hands it to the axios request
 * interceptor. Every API call from then on injects a fresh, automatically-refreshed
 * Clerk session JWT in the `Authorization` header.
 *
 * <p>It also calls {@link posthog.identify} whenever a Clerk user is present and
 * {@link posthog.reset} when they sign out, so backend `$ai_generation` events
 * (which use the same Clerk id as their `distinct_id`) line up with frontend
 * pageviews and UI events on a single person in PostHog.
 *
 * <p>Renders nothing — its only purpose is the side effect.
 */
export default function AuthBridge() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  useEffect(() => {
    setTokenGetter(() => getToken());
    return () => setTokenGetter(null);
  }, [getToken]);

  // Identify (and reset) follow the auth state. We guard on isLoaded so we don't
  // call identify before Clerk knows whether there's a session.
  //
  // We do NOT guard on consent here. `posthog.identify` doesn't capture an
  // event on its own — it just sets the identity used by subsequent captures.
  // Calling it before opt-in is harmless: PostHog drops captures until the
  // user accepts, then attributes everything after that point to the right
  // person row. The alternative (waiting for consent before identifying) would
  // miss attribution on the very first event after accept.
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && userId) {
      posthog.identify(userId);
    } else {
      // On sign-out (or initial anonymous mount), wipe any prior identity so
      // events captured after this point don't get attributed to a stale user.
      posthog.reset();
    }
  }, [isLoaded, isSignedIn, userId]);

  return null;
}
