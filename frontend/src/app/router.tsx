import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import * as Sentry from '@sentry/react';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { LoginLink } from '@kinde-oss/kinde-auth-react/components';
import { useTranslation } from 'react-i18next';
import ProtectedRoute from '../features/auth/ProtectedRoute';
import AuthLayout from '../features/auth/AuthLayout';
import { LOGOUT_IN_PROGRESS_KEY } from '../features/account/api';
import { ErrorFallback } from './providers';
import '../features/auth/auth.css';

// ── Route-level lazy loading ────────────────────────────────────────
// Each of these is the entry point for a distinct user journey and
// pulls in significant chunks of code (the wizard pulls in the
// streaming SSE consumers + PDF font loading; the report viewer pulls
// in the PDF/HTML/PPT exporters; the dashboard pulls in modals). By
// lazy-loading them, the initial bundle that the auth flow needs
// stays small.
//
// The auth-flow routes (LoggedOutRoute, CallbackRoute) are NOT lazy —
// they're tiny, AND they're the entry path for unauthenticated users,
// so eagerness here means the user can land on them without a spinner.
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'));
const NewReportPage = lazy(() => import('../features/report/NewReportPage'));
const ReportPage = lazy(() => import('../features/report/ReportPage'));
const PrivacyPage = lazy(() => import('../features/privacy/PrivacyPage'));
const PublicSharePage = lazy(() => import('../features/publicShare/PublicSharePage'));
const AppShell = lazy(() => import('../features/shell/AppShell'));

/**
 * Logged-out landing page. Kinde redirects here after sign-out
 * (configured via VITE_KINDE_LOGOUT_REDIRECT_URI →
 * '<origin>/logged-out') so the user lands on a branded confirmation
 * rather than Kinde's stock template.
 *
 * <p>This is the only React-side "auth" page now — sign-in and sign-up
 * bounce directly to the Kinde-hosted pages.
 *
 * <p>If the user is somehow already authenticated when they land here
 * (e.g. opened in a new tab while still logged in elsewhere),
 * short-circuit to the wizard.
 */
function LoggedOutRoute() {
  const { t } = useTranslation();
  const { isLoading, isAuthenticated } = useKindeAuth();
  // We've arrived at /logged-out — logout actually completed. Clear
  // the in-progress flag so ProtectedRoute resumes its normal "redirect
  // unauthenticated users to Kinde" behaviour on subsequent navigation.
  useEffect(() => {
    try {
      sessionStorage.removeItem(LOGOUT_IN_PROGRESS_KEY);
    } catch {
      /* ignore */
    }
  }, []);
  if (!isLoading && isAuthenticated) return <Navigate to="/reports/new" replace />;
  return (
    <AuthLayout>
      <LoginLink className="kinde-continue-btn">{t('auth.loggedOut.signInAgain')}</LoginLink>
    </AuthLayout>
  );
}

/**
 * OAuth callback landing page. Kinde redirects here after the user
 * authenticates; the SDK consumes the OAuth params from the URL and
 * flips `isAuthenticated`. We render a loading state until that's
 * done, then forward to the wizard.
 *
 * <p>On failure (e.g. user denied consent on Kinde, state mismatch,
 * network blip), redirect to the marketing homepage rather than
 * looping back into a protected route.
 */
function CallbackRoute() {
  const { t } = useTranslation();
  const { isLoading, isAuthenticated } = useKindeAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      navigate('/reports/new', { replace: true });
    } else {
      globalThis.location.replace('https://futuros.io');
    }
  }, [isLoading, isAuthenticated, navigate]);
  return <div className="loading-screen">{t('common.loading')}</div>;
}

/** Catch-all that preserves the URL's query string when redirecting
 *  to `/reports/new`. See the route comment for why this matters. */
function CatchAllRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: '/reports/new', search: location.search }} replace />;
}

/** Suspense fallback while a lazy route's chunk loads. */
function RouteLoading() {
  const { t } = useTranslation();
  return <div className="loading-screen">{t('common.loading')}</div>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/logged-out" element={<LoggedOutRoute />} />
        <Route path="/callback" element={<CallbackRoute />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/share/:token" element={<PublicSharePage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/reports/new" element={<NewReportPage />} />
          <Route path="/reports/:id/edit" element={<NewReportPage />} />
          <Route path="/reports/:id" element={<ReportPage />} />
        </Route>
        {/* Unknown / bare paths land on the new-report wizard. ProtectedRoute
            intercepts guests and triggers a direct redirect to Kinde — there
            is no React-side sign-in splash anymore. Authenticated users see
            /reports/new with the welcome modal.
            The search string is forwarded so a guest hitting `/?lang=es` still
            carries `?lang=es` into ProtectedRoute, where it gets passed to
            Kinde's login() as the requested language. A literal
            `<Navigate to="/reports/new" />` would strip the query. */}
        <Route path="*" element={<CatchAllRedirect />} />
      </Routes>
    </Suspense>
  );
}

/**
 * Route table wrapped in the route-level ErrorBoundary (Tier 3 of
 * the error-handling strategy).
 *
 * <p>This is NOT the BrowserRouter — that lives one level up in
 * App.tsx so other singletons (CookieConsent's `<Link>`, future
 * router-aware overlays) can be siblings of the routes without
 * each needing its own router context. The boundary lives inside
 * BrowserRouter so the fallback can use router hooks if it needs
 * to.
 */
export default function AppRouter() {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      // Report render-time crashes to Sentry. `componentStack` lets the
      // Sentry UI render the React stack alongside the JS one, which is
      // the only way to figure out WHICH component crashed when the JS
      // stack is just minified helper functions.
      onError={(error, info) => {
        Sentry.captureException(error, {
          contexts: { react: { componentStack: info.componentStack } },
        });
      }}
    >
      <AppRoutes />
    </ErrorBoundary>
  );
}

export { BrowserRouter as RootRouter };
