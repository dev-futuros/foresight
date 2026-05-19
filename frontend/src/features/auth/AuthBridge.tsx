import { useEffect } from 'react';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import * as Sentry from '@sentry/react';
import { setTokenGetter } from '../../lib/api';
import { identify, reset, setUserProperties } from '../../lib/mixpanel';
import { useCurrentUser } from '../account/api';
import { useBillingProfile } from '../billing/api';

/**
 * Connects Kinde's session token to the standalone axios instance used
 * across the app, and mirrors the active Kinde user id into both
 * Sentry (so captured errors carry a {@code user.id} field) and
 * Mixpanel (so product events tie back to a stable distinct_id).
 *
 * <p>Mounted once inside `<KindeProvider>`. Side effects:
 *
 * <ol>
 *   <li>Hands Kinde's async {@code getToken} to the axios request
 *       interceptor so every API call carries a fresh, automatically-
 *       refreshed bearer token.</li>
 *   <li>Calls {@link Sentry.setUser} with the Kinde id whenever a user
 *       is present, and {@link Sentry.setUser}(null) on sign-out, so
 *       error events carry the user dimension without picking up any
 *       email/name/etc. (id only — Sentry's PII-minimal default).</li>
 *   <li>Calls Mixpanel's {@link identify} with the Kinde id on
 *       sign-in and {@link reset} on sign-out so subsequent events
 *       attribute to the right user. Enriches the Mixpanel "people"
 *       profile with email, locale, role, and plan once the local
 *       /me + /billing/entitlements queries resolve — this is the
 *       data that powers cohort filters in the Mixpanel dashboard.</li>
 * </ol>
 *
 * <p>Renders nothing — its only purpose is the side effects.
 */
export default function AuthBridge() {
  const { getToken, isLoading, isAuthenticated, user } = useKindeAuth();
  // Both queries are gated on isAuthenticated internally, so they
  // stay disabled (and harmless) for signed-out users.
  const { data: meData } = useCurrentUser();
  const { data: billingData } = useBillingProfile();

  // Wire Kinde's async getToken into the axios interceptor. Re-binds
  // whenever the function identity changes (e.g. after a fresh
  // sign-in) so a stale closure can't hand axios an outdated token
  // getter. Kinde returns `string | undefined`; the axios layer
  // expects `string | null`, so map at the boundary.
  useEffect(() => {
    setTokenGetter(async () => (await getToken()) ?? null);
    return () => setTokenGetter(null);
  }, [getToken]);

  // Sentry + Mixpanel identity. Guard on !isLoading so we don't flip
  // user → null during the brief hydration window before Kinde knows
  // whether there's a session. Both SDKs no-op when their respective
  // env var is unset (no DSN / no token), so this stays safe in
  // local dev.
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && user?.id) {
      Sentry.setUser({ id: user.id });
      identify(user.id);
    } else {
      Sentry.setUser(null);
      // reset() clears Mixpanel's distinct_id + super properties so
      // the next session on this browser doesn't bleed into the
      // previous user's profile.
      reset();
    }
  }, [isLoading, isAuthenticated, user?.id]);

  // Enrich the Mixpanel people profile once the backend data lands.
  // Kept in a separate effect from identify() because /me and
  // /billing/entitlements resolve asynchronously and independently;
  // people.set is idempotent so re-running on either update is fine.
  // Email is the same trust boundary we already share with Sentry's
  // user context, so no incremental privacy exposure.
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user?.id) return;
    const props: Record<string, unknown> = {};
    if (meData) {
      // $email is a Mixpanel-reserved property name — using it (with
      // the dollar prefix) lets Mixpanel render the user's email in
      // the People view and use it for cohort-based notifications.
      if (meData.email) props.$email = meData.email;
      if (meData.name) props.$name = meData.name;
      props.role = meData.role;
      props.locale = meData.language;
    }
    if (billingData) {
      // Null plan === free tier. Send a stable string either way so
      // the Mixpanel dashboard can filter without dealing with
      // missing-property semantics.
      props.plan = billingData.plan ?? 'free';
    }
    if (Object.keys(props).length > 0) {
      setUserProperties(props);
    }
  }, [isLoading, isAuthenticated, user?.id, meData, billingData]);

  return null;
}
