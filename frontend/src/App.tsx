import AuthBridge from './features/auth/AuthBridge';
import IconSprite from './components/IconSprite';
import CookieConsent from './features/cookies/CookieConsent';
import AppProviders from './app/providers';
import AppRouter, { RootRouter } from './app/router';

/**
 * App root.
 *
 * <p>Composition layers (top to bottom):
 * <ol>
 *   <li>{@link AppProviders} — Kinde + React Query providers (and
 *       any other tree-wide context). Provider details live in
 *       src/app/providers.tsx so this file stays a thin composer.</li>
 *   <li>{@link RootRouter} — the BrowserRouter. Lives here (not inside
 *       AppRouter) so router-aware singletons mounted as siblings of
 *       the route table — CookieConsent's `<Link to="/privacy">`, and
 *       future overlays — can use react-router hooks/components
 *       without each needing its own provider.</li>
 *   <li>Singletons mounted inside the router:
 *     <ul>
 *       <li>{@link IconSprite} — the inline SVG sprite. Mounting once
 *           at the root means every icon-by-href call hits a single
 *           SVG element regardless of which route is active.</li>
 *       <li>{@link AuthBridge} — Kinde session glue (sets the bearer
 *           token on the API client).
 *           Runs on every route including the auth flow.</li>
 *     </ul>
 *   </li>
 *   <li>{@link AppRouter} — the Routes table + route-level
 *       ErrorBoundary. See src/app/router.tsx.</li>
 *   <li>{@link CookieConsent} — overlay UI shown on every page until
 *       the user makes a choice. Uses `<Link>` to the privacy page,
 *       hence the BrowserRouter requirement.</li>
 * </ol>
 */
export default function App() {
  return (
    <AppProviders>
      <RootRouter>
        <IconSprite />
        <AuthBridge />
        <AppRouter />
        <CookieConsent />
      </RootRouter>
    </AppProviders>
  );
}
