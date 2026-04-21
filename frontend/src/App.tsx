import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './features/auth/LoginPage';
import RegisterPage from './features/auth/RegisterPage';
import DashboardPage from './features/dashboard/DashboardPage';
import NewReportPage from './features/report/NewReportPage';
import ReportPage from './features/report/ReportPage';
const AccountPage = () => <div>Account</div>;

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/dashboard"
            element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
          />
          <Route
            path="/reports/new"
            element={<ProtectedRoute><NewReportPage /></ProtectedRoute>}
          />
          <Route
            path="/reports/:id"
            element={<ProtectedRoute><ReportPage /></ProtectedRoute>}
          />
          <Route
            path="/account"
            element={<ProtectedRoute><AccountPage /></ProtectedRoute>}
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
