import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { track } from './mixpanel';

/**
 * Fires a {@code Page Viewed} Mixpanel event every time the router's
 * location changes — including the initial mount.
 *
 * <p>Mixpanel's built-in {@code track_pageview} option only fires on
 * full page loads, which misses every SPA route change (i.e. almost
 * every navigation in this app). The official remediation is to wire
 * the router's location into a manual track call, which is what this
 * hook does.
 *
 * <p><b>Why this isn't a command:</b> route changes come from
 * sources outside app code — browser back/forward, direct URL entry,
 * page refresh, and programmatic {@code navigate()} calls scattered
 * across mutation success handlers. The bus-level
 * {@code Command Dispatched} event captures user dispatches (loadReport,
 * goTo, newReport, etc.), but it can't capture the browser-driven
 * navigations or the post-mutation navigates. {@code Page Viewed} is
 * the router state observer — semantically different from a user
 * dispatch and captures a strictly larger set of transitions.
 *
 * <p>Properties shipped:
 * <ul>
 *   <li>{@code path} — pathname without query string. Bounded
 *       cardinality (routes are listed in {@code app/router.tsx}), so
 *       this slices cleanly in Mixpanel funnels.</li>
 *   <li>{@code search} — raw query string (excluding the {@code ?}).
 *       Useful for things like {@code ?lang=es} or share-link
 *       referrals; can carry low-PII params, never report content.</li>
 * </ul>
 *
 * <p>Mount once from the app shell. The {@code track} call no-ops
 * silently when Mixpanel isn't initialised (no token) or when the
 * user hasn't accepted cookies, so this is safe to mount
 * unconditionally.
 */
export function usePageViewTracking(): void {
  const location = useLocation();
  useEffect(() => {
    track('Page Viewed', {
      path: location.pathname,
      // Strip the leading '?' so dashboard filters can match on the
      // raw key=value pairs without escaping.
      search: location.search.startsWith('?') ? location.search.slice(1) : location.search,
    });
  }, [location.pathname, location.search]);
}
