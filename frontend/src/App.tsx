import AuthBridge from './components/AuthBridge';
import IconSprite from './components/IconSprite';
import CookieConsent from './features/cookies/CookieConsent';
import AppProviders from './app/providers';
import AppRouter from './app/router';

/**
 * App root.
 *
 * <p>Composition layers (top to bottom):
 * <ol>
 *   <li>{@link AppProviders} — Kinde + React Query providers (and
 *       any other tree-wide context). Provider details live in
 *       src/app/providers.tsx so this file stays a thin composer.</li>
 *   <li>Singletons mounted as siblings of the router:
 *     <ul>
 *       <li>{@link IconSprite} — the inline SVG sprite. Mounting once
 *           at the root means every icon-by-href call hits a single
 *           SVG element regardless of which route is active.</li>
 *       <li>{@link AuthBridge} — Kinde session glue (sets the bearer
 *           token on the API client, refreshes on focus, etc.).
 *           Sits outside the router because it must run on every
 *           route, including the auth flow.</li>
 *     </ul>
 *   </li>
 *   <li>{@link AppRouter} — the BrowserRouter + route table + route-
 *       level ErrorBoundary. See src/app/router.tsx.</li>
 *   <li>{@link CookieConsent} — overlay UI; mounted outside the router
 *       so it shows on every page including the auth flow.</li>
 * </ol>
 */
export default function App() {
  return (
    <AppProviders>
      <IconSprite />
      <AuthBridge />
      <AppRouter />
      <CookieConsent />
    </AppProviders>
  );
}
