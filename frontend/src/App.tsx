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
import PrivacyPage from './features/privacy/PrivacyPage';
import PublicSharePage from './features/publicShare/PublicSharePage';
import AuthLayout from './features/auth/AuthLayout';
import { clerkAppearance, clerkVariables } from './features/auth/clerkAppearance';
import { clerkLocalization } from './features/auth/clerkLocalization';
import { userButtonAppearance } from './features/account/userButtonAppearance';
import AppShell from './features/shell/AppShell';
import CookieConsent from './features/cookies/CookieConsent';
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
      </Route>
      {/* Unknown / bare paths land on the new-report wizard so a freshly
          loaded app shows the onboarding dialog instead of the dashboard.
          ProtectedRoute will intercept and bounce to /sign-in for guests;
          authenticated users see /reports/new with the welcome modal. */}
      <Route path="*" element={<Navigate to="/reports/new" replace />} />
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
  // Clerk doesn't ship a Catalan bundle. When the user's UI language is
  // Catalan, fall back to Spanish for Clerk's internal copy — it's the
  // closest match (Catalan speakers are virtually all bilingual with
  // Spanish in the regions where the app is used) and matches what
  // we'd see if a third-party widget didn't recognise 'ca'.
  const resolved = i18n.resolvedLanguage ?? i18n.language ?? 'es';
  const lang: 'es' | 'en' = resolved.startsWith('en') ? 'en' : 'es';
  const localization = clerkLocalization(lang, 'signin');

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl="/sign-in"
      localization={localization}
      // Global appearance with the shared palette + the userProfile
      // sub-config from userButtonAppearance. Setting it at the provider
      // level (not just on the UserButton instance) ensures Clerk's
      // portal-rendered UserProfile modal — which is opened from the
      // UserButton but mounted outside the component subtree — still
      // picks up our element classes. SignIn/SignUp keep their own
      // appearance prop, which overrides this on a per-instance basis.
      //
      // userVerification is the step-up reverification flow (rendered
      // when a sensitive action requires re-auth — e.g. adding an
      // email). Same modal shape as UserProfile, same element keys, so
      // we reuse the same element map. Without this scope the OTP /
      // header / card / button fall back to Clerk defaults.
      appearance={{
        variables: clerkVariables,
        // Top-level `elements` apply globally to every Clerk component
        // rendered in this provider — including ones that aren't
        // exposed via a per-component scope (e.g. userVerification,
        // the step-up reverification flow). SignIn/SignUp pass their
        // own per-instance appearance, which overrides this at the
        // instance level, so the auth screens are unaffected.
        elements: userButtonAppearance.userProfile.elements,
        userProfile: userButtonAppearance.userProfile,
      }}
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
    </ClerkProvider>
  );
}
