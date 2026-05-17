import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { KindeProvider, useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { LoginLink } from '@kinde-oss/kinde-auth-react/components';
import { useTranslation } from 'react-i18next';
import { queryClient } from './lib/queryClient';
import AuthBridge from './components/AuthBridge';
import IconSprite from './components/IconSprite';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardPage from './features/dashboard/DashboardPage';
import NewReportPage from './features/report/NewReportPage';
import ReportPage from './features/report/ReportPage';
import PrivacyPage from './features/privacy/PrivacyPage';
import PublicSharePage from './features/publicShare/PublicSharePage';
import AuthLayout from './features/auth/AuthLayout';
import AppShell from './features/shell/AppShell';
import CookieConsent from './features/cookies/CookieConsent';
import './features/auth/auth.css';

/**
 * Logged-out landing page. Kinde redirects here after sign-out (configured
 * via VITE_KINDE_LOGOUT_REDIRECT_URI → '<origin>/logged-out') so the user
 * lands on a branded confirmation rather than Kinde's stock template.
 *
 * This is the only React-side "auth" page now — sign-in and sign-up bounce
 * directly to the Kinde-hosted pages (which we style via the foresight-kinde
 * custom-UI repo), so no intermediate splash exists.
 *
 * If the user is somehow already authenticated when they land here (e.g.
 * opened in a new tab while still logged in elsewhere), short-circuit to
 * the wizard.
 */
function LoggedOutRoute() {
  const { t } = useTranslation();
  const { isLoading, isAuthenticated } = useKindeAuth();
  if (!isLoading && isAuthenticated) return <Navigate to="/reports/new" replace />;
  return (
    <AuthLayout>
      {/* No lang prop — the app doesn't participate in language handoff
          to Kinde yet. Kinde will fall back to its default (or whatever
          the user picked last on a Kinde page). When the post-login
          profile-read work lands, we may want to forward i18n.language. */}
      <LoginLink className="kinde-continue-btn">
        {t('auth.loggedOut.signInAgain')}
      </LoginLink>
    </AuthLayout>
  );
}

/**
 * OAuth callback landing page. Kinde redirects here after the user
 * authenticates; the SDK consumes the OAuth params from the URL and flips
 * `isAuthenticated`. We render a loading state until that's done, then
 * forward to the wizard.
 *
 * On failure (e.g. user denied consent on Kinde, state mismatch, network
 * blip), redirect to the marketing homepage rather than looping back into
 * a protected route — ProtectedRoute would just bounce them straight back
 * into the Kinde login flow, which is the wrong UX after a deliberate
 * denial.
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

function AppRoutes() {
  // No useLanguageSync here. The language is driven entirely by
  // i18next-browser-languagedetector (URL ?lang= → futuros_lang cookie →
  // localStorage → navigator → fallback 'es'). User-initiated language
  // changes go through AccountModal, which calls both i18n.changeLanguage()
  // and PATCH /users/me — i18n is the local source of truth, and the
  // server preference is updated explicitly when the user picks a new
  // language in-app.
  return (
    <Routes>
      <Route path="/logged-out" element={<LoggedOutRoute />} />
      <Route path="/callback" element={<CallbackRoute />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/share/:token" element={<PublicSharePage />} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/reports/new" element={<NewReportPage />} />
        <Route path="/reports/:id/edit" element={<NewReportPage />} />
        <Route path="/reports/:id" element={<ReportPage />} />
      </Route>
      {/* Unknown / bare paths land on the new-report wizard. ProtectedRoute
          intercepts guests and triggers a direct redirect to Kinde — there
          is no React-side sign-in splash anymore. Authenticated users see
          /reports/new with the welcome modal. */}
      <Route path="*" element={<Navigate to="/reports/new" replace />} />
    </Routes>
  );
}

const KINDE_DOMAIN = import.meta.env.VITE_KINDE_DOMAIN;
const KINDE_CLIENT_ID = import.meta.env.VITE_KINDE_CLIENT_ID;
const KINDE_REDIRECT_URI =
  import.meta.env.VITE_KINDE_REDIRECT_URI ?? `${globalThis.location.origin}/callback`;
const KINDE_LOGOUT_URI =
  import.meta.env.VITE_KINDE_LOGOUT_REDIRECT_URI ?? globalThis.location.origin;

export default function App() {
  return (
    <KindeProvider
      clientId={KINDE_CLIENT_ID}
      domain={KINDE_DOMAIN}
      redirectUri={KINDE_REDIRECT_URI}
      logoutUri={KINDE_LOGOUT_URI}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <IconSprite />
          <AuthBridge />
          <AppRoutes />
          {/* Mounted outside <AppRoutes> so it overlays every page — auth, dashboard,
              public share, privacy. CookieConsent only renders once consent is missing
              from localStorage, so authenticated users who already opted in never see it. */}
          <CookieConsent />
        </BrowserRouter>
      </QueryClientProvider>
    </KindeProvider>
  );
}
