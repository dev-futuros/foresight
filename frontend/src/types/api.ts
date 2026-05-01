// TypeScript types mirroring backend DTOs

export type UserRole = 'USER' | 'ADMIN';
export type ReportStatus = 'DRAFT' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface UserResponse {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  language: string;
  emailVerified: boolean;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: UserResponse;
}

export interface ReportSummary {
  id: string;
  title: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ReportResponse {
  id: string;
  title: string;
  status: ReportStatus;
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

export interface ApiError {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  path: string;
  fieldErrors: { field: string; message: string }[] | null;
}

// Requests
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
  language?: string;
}

export interface CreateReportRequest {
  title: string;
  inputData: Record<string, unknown>;
}

export interface UpdateReportRequest {
  title?: string;
  inputData?: Record<string, unknown>;
  resultData?: Record<string, unknown>;
}

export interface UpdateUserRequest {
  name?: string;
  language?: 'es' | 'en';
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
