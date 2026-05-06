import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { SignIn, SignUp } from '@clerk/react';
import { queryClient } from './lib/queryClient';
import AuthBridge from './components/AuthBridge';
import IconSprite from './components/IconSprite';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardPage from './features/dashboard/DashboardPage';
import NewReportPage from './features/report/NewReportPage';
import ReportPage from './features/report/ReportPage';
import AccountPage from './features/account/AccountPage';
import PrivacyPage from './features/privacy/PrivacyPage';
import AuthLayout from './features/auth/AuthLayout';
import { clerkAppearance } from './features/auth/clerkAppearance';
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
              forceRedirectUrl="/dashboard"
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
              forceRedirectUrl="/dashboard"
              appearance={clerkAppearance}
            />
          </AuthLayout>
        }
      />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/reports/new" element={<NewReportPage />} />
        <Route path="/reports/:id" element={<ReportPage />} />
        <Route path="/account" element={<AccountPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <IconSprite />
        <AuthBridge />
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
