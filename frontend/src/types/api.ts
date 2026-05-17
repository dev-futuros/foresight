// TypeScript types mirroring backend DTOs

export type UserRole = 'USER' | 'DEV' | 'ADMIN';
export type ReportStatus = 'DRAFT' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface UserResponse {
  id: string;
  /** Composed from Kinde first_name + last_name. May be null on first sign-in before the user fills it in. */
  name: string | null;
  /** Kinde `preferred_email`. Read-only on our side — change via Kinde's hosted account flow. */
  email: string | null;
  /** Kinde `picture` URL. Null when the user hasn't set a profile picture. */
  picture: string | null;
  role: UserRole;
  /** Kinde Property `language`. Defaults to "es" when unset. */
  language: string;
}

export interface ReportSummary {
  id: string;
  title: string;
  status: ReportStatus;
  /** ISO-639-1 code of the language the wizard used. Mirrors `ReportResponse`. */
  primaryLanguage: 'es' | 'en';
  /**
   * Languages this report is available in. Always contains {@link primaryLanguage};
   * additional entries appear after a translation has been materialised. Driven by
   * the dashboard's translate-chip UI so the user can see at a glance which reports
   * are bilingual and which still need work.
   */
  availableLanguages: string[];
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
  /**
   * Per-language cache of "tightened" prose used by the PDF export
   * pipeline. The export picks a magazine-style layout, asks the
   * /api/ai/tighten endpoint to shorten anything that overflows, and
   * writes the result back here so repeat exports skip the LLM round-
   * trip. {@code null} on reports that have never been exported.
   */
  pdfOptimized: PdfOptimizedCache | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One language entry inside {@link ReportResponse#pdfOptimized}.
 *
 * <p>{@code fields} maps dotted JSON paths into the report's resultData /
 * inputData (e.g. {@code "executiveSummary"},
 * {@code "scenarios.0.firstMove"}) to the tightened string that the PDF
 * pipeline should render in place of the original text. Paths missing
 * from this map fall back to the source text at render time.
 */
export interface PdfOptimizedEntry {
  version: number;
  generatedAt: string;
  fields: Record<string, string>;
}

/** Map of language code → tightened-entry. Cleared per-language when the source text changes. */
export type PdfOptimizedCache = Partial<Record<'es' | 'en', PdfOptimizedEntry>>;

/** Payload returned by the `POST /api/reports/{id}/translate` endpoint. */
export interface TranslatedReport {
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
  generatedAt?: string;
}

/**
 * Lightweight projection of an example for the dashboard list. Mirrors
 * {@link ReportSummary} so the same card renderer handles both — status
 * is always {@code COMPLETED} for examples (the promote flow rejects
 * sources that haven't generated their analysis).
 */
export interface ExampleSummary {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  primaryLanguage: 'es' | 'en';
  availableLanguages: string[];
  createdAt: string;
  updatedAt: string;
}

/** Full projection of an example for the read endpoint. */
export interface ExampleResponse {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  primaryLanguage: 'es' | 'en';
  availableLanguages: string[];
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** Body for {@code POST /api/reports/{reportId}/promote-to-example}. */
export interface PromoteToExampleRequest {
  /** Required; kebab-case (lowercase, digits, single hyphens). Stable
   *  upsert key — repeat to overwrite the existing example. */
  slug: string;
  /** Optional title override; falls back to the source report's title. */
  title?: string;
  /** Optional one-liner shown under the title on the dashboard card. */
  description?: string;
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

/**
 * A frozen per-language snapshot inside a share token's translations map.
 * Mirrors {@code share.translations.<lang>} from the backend — same shape
 * as the equivalent block on a {@link ReportResponse}.
 */
export interface SharedTranslationEntry {
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
  generatedAt?: string;
}

export interface PublicShareResponse {
  title: string;
  /** ISO-639-1 of the language carried in {@code inputData}/{@code resultData}. */
  primaryLanguage: 'es' | 'en';
  /** Union of {@code primaryLanguage} and the keys of {@code translations}, primary first. */
  availableLanguages: ('es' | 'en')[];
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
  /** Cached translations frozen at share creation. {@code null} on
   *  legacy (pre-V10) single-language shares. */
  translations: Record<string, SharedTranslationEntry> | null;
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
