import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { KindeProvider, useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { LoginLink, RegisterLink } from '@kinde-oss/kinde-auth-react/components';
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
import { useLanguageSync } from './hooks/useLanguageSync';
import './features/auth/auth.css';

/**
 * Sign-in route — renders the branded auth shell with a "Continue with Kinde →"
 * button that redirects to Kinde's hosted login page. We keep the shell instead
 * of auto-redirecting so the user sees the brand before bouncing off-site.
 *
 * If a session is already live (e.g. user opens /sign-in in a new tab while
 * authenticated elsewhere), short-circuit straight to the wizard.
 */
function SignInRoute() {
  const { t } = useTranslation();
  const { isLoading, isAuthenticated } = useKindeAuth();
  if (!isLoading && isAuthenticated) return <Navigate to="/reports/new" replace />;
  return (
    <AuthLayout copyKey="auth.login">
      <LoginLink className="kinde-continue-btn">
        {t('auth.login.continueWithKinde')}
      </LoginLink>
    </AuthLayout>
  );
}

/** Sign-up — same shape as sign-in but starts the registration flow. */
function SignUpRoute() {
  const { t } = useTranslation();
  const { isLoading, isAuthenticated } = useKindeAuth();
  if (!isLoading && isAuthenticated) return <Navigate to="/reports/new" replace />;
  return (
    <AuthLayout copyKey="auth.register">
      <RegisterLink className="kinde-continue-btn">
        {t('auth.register.continueWithKinde')}
      </RegisterLink>
    </AuthLayout>
  );
}

/**
 * OAuth callback landing page. Kinde redirects here after the user authenticates;
 * the SDK consumes the OAuth params from the URL and flips `isAuthenticated`. We
 * render a loading state until that's done, then navigate to the wizard (or back
 * to sign-in if something went wrong).
 */
function CallbackRoute() {
  const { t } = useTranslation();
  const { isLoading, isAuthenticated } = useKindeAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (isLoading) return;
    navigate(isAuthenticated ? '/reports/new' : '/sign-in', { replace: true });
  }, [isLoading, isAuthenticated, navigate]);
  return <div className="loading-screen">{t('common.loading')}</div>;
}

function AppRoutes() {
  useLanguageSync();
  return (
    <Routes>
      <Route path="/sign-in/*" element={<SignInRoute />} />
      <Route path="/sign-up/*" element={<SignUpRoute />} />
      <Route path="/callback" element={<CallbackRoute />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/share/:token" element={<PublicSharePage />} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/reports/new" element={<NewReportPage />} />
        <Route path="/reports/:id/edit" element={<NewReportPage />} />
        <Route path="/reports/:id" element={<ReportPage />} />
      </Route>
      {/* Unknown / bare paths land on the new-report wizard so a freshly
          loaded app shows the onboarding dialog instead of the dashboard.
          ProtectedRoute will intercept and bounce to /sign-in for guests;
          authenticated users see /reports/new with the welcome modal. */}
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
