// TypeScript types mirroring backend DTOs

export type UserRole = 'USER' | 'ADMIN';
export type ReportStatus = 'DRAFT' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface UserResponse {
  id: string;
  name: string | null;
  role: UserRole;
  language: string;
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
  /**
   * Language the wizard used to generate this report. Translations to
   * other languages are produced on demand from the share / export
   * dialogs — see {@link availableLanguages}.
   */
  primaryLanguage: 'es' | 'en';
  /**
   * Languages this report is available in. Always contains
   * {@link primaryLanguage}; additional entries appear after a
   * translation has been materialised. Used by share/export dialogs
   * to label whether picking a language will be instant ("already
   * available") or trigger a translation call.
   */
  availableLanguages: string[];
  createdAt: string;
  updatedAt: string;
}

/** Payload returned by the `POST /api/reports/{id}/translate` endpoint. */
export interface TranslatedReport {
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
  generatedAt?: string;
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

// Share
export interface CreateShareResponse {
  token: string;
  shareUrl: string;
  expiresAt: string;
}

export interface PublicShareResponse {
  title: string;
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
  createdAt: string;
  expiresAt: string;
}

// Requests
export interface CreateReportRequest {
  title: string;
  inputData: Record<string, unknown>;
  /** ISO-639-1 code identifying the wizard's language. Defaults to 'es' server-side. */
  primaryLanguage?: 'es' | 'en';
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
