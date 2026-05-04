import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { SignIn, SignUp } from '@clerk/react';
import { queryClient } from './lib/queryClient';
import AuthBridge from './components/AuthBridge';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardPage from './features/dashboard/DashboardPage';
import NewReportPage from './features/report/NewReportPage';
import ReportPage from './features/report/ReportPage';
import AccountPage from './features/account/AccountPage';
import { useLanguageSync } from './hooks/useLanguageSync';
import './features/auth/auth.css';

function AppRoutes() {
  useLanguageSync();
  return (
    <Routes>
      <Route
        path="/sign-in/*"
        element={
          <div className="auth-bg">
            <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/dashboard" />
          </div>
        }
      />
      <Route
        path="/sign-up/*"
        element={
          <div className="auth-bg">
            <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/dashboard" />
          </div>
        }
      />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/reports/new" element={<ProtectedRoute><NewReportPage /></ProtectedRoute>} />
      <Route path="/reports/:id" element={<ProtectedRoute><ReportPage /></ProtectedRoute>} />
      <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthBridge />
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
