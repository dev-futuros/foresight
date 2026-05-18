import type { LanguageCode } from '../i18n/languages';
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

/**
 * Composed billing snapshot returned by `GET /api/billing/entitlements`. Joins Kinde Account
 * API data (plan + per-feature limits) with the local report count for the current period.
 */
export interface BillingProfileResponse {
  userId: string;
  /** Kinde plan key (e.g. "pro") or null when the user has no active subscription. */
  plan: string | null;
  /** Per-period cap from `reports_per_periodo`. Null when `plan` is null. */
  reportsLimit: number | null;
  /** Reports the user has created since `periodStart` (counted locally). */
  reportsUsed: number;
  /** ISO-8601 timestamp the current monthly period began. */
  periodStart: string;
  /** ISO-8601 timestamp the current period ends. */
  periodEnd: string;
}

export interface ReportSummary {
  id: string;
  title: string;
  status: ReportStatus;
  /** ISO-639-1 code of the language the wizard used. Mirrors `ReportResponse`. */
  primaryLanguage: LanguageCode;
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
  primaryLanguage: LanguageCode;
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
export type PdfOptimizedCache = Partial<Record<LanguageCode, PdfOptimizedEntry>>;

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
  primaryLanguage: LanguageCode;
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
  primaryLanguage: LanguageCode;
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
  /**
   * Status-specific structured details. Populated by the backend on errors that need extra
   * data alongside the standard envelope — e.g. `{ limit, used, periodEnd }` on the 429
   * from the billing gate, so the frontend can render a richer paywall.
   */
  details?: Record<string, unknown> | null;
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
  primaryLanguage: LanguageCode;
  /** Union of {@code primaryLanguage} and the keys of {@code translations}, primary first. */
  availableLanguages: LanguageCode[];
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
  primaryLanguage?: LanguageCode;
}

export interface UpdateReportRequest {
  title?: string;
  inputData?: Record<string, unknown>;
  resultData?: Record<string, unknown>;
}

export interface UpdateUserRequest {
  name?: string;
  language?: LanguageCode;
}

// ── AI analysis result types ────────────────────────────────────────
// Shapes the backend's /api/ai/analyze/* proxy returns, parsed out of
// the Anthropic content blocks. Lives here (rather than in
// features/report/types.ts) because they're cross-feature: the report
// tabs render them, the PDF/HTML/PPT exporters read them, and
// buildAssistantSnapshot in lib/ derives a chat context from them.

/**
 * 3P scenario as produced by the analyzeScenarios prompt. `type` is the
 * localized 3P token ("Probable" / "Plausible" / "Possible" in English,
 * "Probable" / "Plausible" / "Posible" in Spanish). `name` is the
 * model's evocative title; legacy reports may have `title` instead.
 */
export interface Scenario {
  type: string;
  name?: string;
  /** @deprecated Legacy flat-shape field. New reports populate `name`. */
  title?: string;
  /** Probability percentage as a display string, e.g. "72%". The three
   *  scenarios in a report sum to 100%. */
  probability?: string;
  description: string;
  opportunities?: string[];
  threats?: string[];
  successFactors?: string[];
  firstMove?: string;
}

export interface KeyUncertainty {
  name: string;
  description: string;
}

/**
 * `dimension` is a localized STEEP dimension name — Spanish: "Social",
 * "Tecnológico", "Económico", "Medioambiental", "Político"; English:
 * "Social", "Technological", "Economic", "Environmental", "Political";
 * Catalan: "Social", "Tecnològic", "Econòmic", "Mediambiental",
 * "Polític". Consumers that want to icon-map by dimension should
 * normalize.
 */
export interface WeakSignal {
  title: string;
  dimension: string;
  description: string;
}

export interface Wildcard {
  title: string;
  description: string;
}

export interface DrivingForce {
  rank: number;
  title: string;
  description: string;
  /** 0-100, strictly descending across the 4 ranked forces. */
  impactScore: number;
}

export interface UncertaintyAxis {
  label: string;
  poleHigh: string;
  poleLow: string;
  rationale: string;
}

export interface ScenarioLogic {
  /** Evocative scenario name matching the corresponding 3P scenario. */
  name: string;
  logic: string;
}

/**
 * Scenario-planning payload. The backend wraps this under a top-level
 * "scenarioPlanning" key; the analyzeScenarioPlanning fetcher unwraps
 * so callers address fields directly.
 */
export interface ScenarioPlanning {
  intro?: string;
  drivingForces?: DrivingForce[];
  axes?: UncertaintyAxis[];
  scenarioLogics?: ScenarioLogic[];
}

export interface BackcastingMilestone {
  /** Calendar year as a string (e.g. "2031"); supplied by the user-prompt context block. */
  year: string;
  title: string;
  description: string;
  actions?: string[];
}

export interface BackcastingEntry {
  scenarioType: string;
  /** Placeholder name returned by the model; the client patches it with the matching scenario's `name`. */
  scenarioName: string;
  visionStatement: string;
  milestones?: BackcastingMilestone[];
  startingPoint: string;
}

/** Flat array of backcasting trajectories — one per 3P scenario. */
export type Backcasting = BackcastingEntry[];

export interface StrategicPriority {
  /** "H1" | "H2" | "H3". */
  horizon: string;
  /** Localized timeframe string (e.g. "0-18 meses", "18 meses-2 años"). */
  timeframe: string;
  title: string;
  impact: 'low' | 'medium' | 'high';
  actions?: string[];
}

/** Flat list of strategic priorities, 2 per horizon. */
export type StrategicMap = StrategicPriority[];

export interface SourceItem {
  title: string;
  url: string;
  /**
   * One-sentence rationale supplied by the standalone /analyze/sources
   * call. Per-section citation lists omit it because web_search only
   * provides title + URL.
   */
  description?: string;
}

/**
 * Sources surfaced under the report. The standalone /analyze/sources
 * returns the flat `sources` list, but the new pipeline also groups
 * citations by section (A-E) plus a "Global STEEP" bucket. Fields are
 * optional so this type works for both shapes — renderer falls back
 * gracefully.
 */
export interface Sources {
  sources?: SourceItem[];
  report?: SourceItem[];
  bySection?: Partial<Record<'A' | 'B' | 'C' | 'D' | 'E', SourceItem[]>>;
  globalSteep?: SourceItem[];
}

/** Section-A payload — exec summary + supporting fields. */
export interface AnalyzeSummary {
  executiveSummary?: string;
  keyUncertainties?: KeyUncertainty[];
  weakSignals?: WeakSignal[];
  wildcards?: Wildcard[];
}

/** Top-level analyze response (the legacy unary `analyze` endpoint). */
export interface AnalyzeReport {
  scenarios?: Scenario[];
  weakSignals?: WeakSignal[];
  wildcards?: Wildcard[];
  keyUncertainties?: KeyUncertainty[];
  /** 2 short paragraphs separated by `\n\n`. */
  executiveSummary?: string;
  [key: string]: unknown;
}

/** Suggestion list item from the wizard's suggestSteep/suggestHorizon hooks. */
export interface SuggestionItem {
  title: string;
  description: string;
}

/** Global STEEP block — the five dimensions of the macro context scan. */
export interface GlobalSteep {
  S: string;
  T: string;
  E: string;
  ENV: string;
  P: string;
}

export type GlobalSteepDimension = keyof GlobalSteep;

/**
 * Companion shape returned by every analyze section call. `result` is
 * the parsed JSON the prompt produced; `citations` is the deduped list
 * of web_search URLs the model consulted during this turn.
 */
export interface AnalyzeSectionResponse<T> {
  result: T;
  citations: SourceItem[];
}

/**
 * Per-section progress event surfaced to the loader UI.
 *
 * <p>`chars` is the running total of characters streamed from the
 * model's text-delta blocks; `sources` is the running count of unique
 * URLs harvested from web_search_tool_result blocks during the turn.
 */
export interface AnalyzeProgress {
  chars: number;
  sources: number;
}

export type ProgressCallback = (progress: AnalyzeProgress) => void;

/** Shared request shape for the analyze-section endpoints. */
export interface AnalyzeArgs {
  companyProfile: unknown;
  steep: unknown;
  horizon: unknown;
  /**
   * Shared research bullets gathered by analyzeScan up front. When
   * present, the 5 section calls fold this verbatim into their user
   * prompt so they can anchor on the same facts and skip their own
   * web_search loop (~5× cheaper end-to-end).
   */
  research?: string;
  language: LanguageCode;
}
