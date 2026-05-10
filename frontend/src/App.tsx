import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp } from '@clerk/react';
import { useTranslation } from 'react-i18next';
import { queryClient } from './lib/queryClient';
import AuthBridge from './components/AuthBridge';
import IconSprite from './components/IconSprite';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardPage from './features/dashboard/DashboardPage';
import NewReportPage from './features/report/NewReportPage';
import ReportPage from './features/report/ReportPage';
import AccountPage from './features/account/AccountPage';
import PrivacyPage from './features/privacy/PrivacyPage';
import PublicSharePage from './features/publicShare/PublicSharePage';
import AuthLayout from './features/auth/AuthLayout';
import { clerkAppearance } from './features/auth/clerkAppearance';
import { clerkLocalization } from './features/auth/clerkLocalization';
import AppShell from './features/shell/AppShell';
import { useLanguageSync } from './hooks/useLanguageSync';
import './features/auth/auth.css';

function AppRoutes() {
  useLanguageSync();
  return (
    <Routes>
      <Route
        path="/sign-in/*"
        element={
          <AuthLayout copyKey="auth.login">
            <SignIn
              routing="path"
              path="/sign-in"
              signUpUrl="/sign-up"
              forceRedirectUrl="/reports/new"
              appearance={clerkAppearance}
            />
          </AuthLayout>
        }
      />
      <Route
        path="/sign-up/*"
        element={
          <AuthLayout copyKey="auth.register">
            <SignUp
              routing="path"
              path="/sign-up"
              signInUrl="/sign-in"
              forceRedirectUrl="/reports/new"
              appearance={clerkAppearance}
            />
          </AuthLayout>
        }
      />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/share/:token" element={<PublicSharePage />} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/reports/new" element={<NewReportPage />} />
        <Route path="/reports/:id/edit" element={<NewReportPage />} />
        <Route path="/reports/:id" element={<ReportPage />} />
        <Route path="/account" element={<AccountPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export default function App() {
  // Read the active locale from i18next so Clerk's internal copy ("Continue",
  // "Email address", "OR", footer toggle, etc.) translates with the rest of
  // the UI. Switching the language pill remounts ClerkProvider — fine on the
  // unauthed auth pages where there's no session state to preserve.
  const { i18n } = useTranslation();
  const lang: 'es' | 'en' = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'es';
  const localization = clerkLocalization(lang, 'signin');

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl="/sign-in"
      localization={localization}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <IconSprite />
          <AuthBridge />
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
