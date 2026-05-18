/**
 * Pure HTTP fetchers for the report feature. No React, no React Query —
 * each function is an async wrapper over a single backend endpoint that
 * returns the parsed payload.
 *
 * Per docs/REFACTOR_PROPOSAL.md: keeping fetchers as plain async functions
 * makes them unit-testable (no QueryClient needed), reusable from
 * non-React contexts (e.g. PDF export pipelines), and trivial to mock.
 * The corresponding React Query hooks live alongside in queries.ts /
 * mutations.ts and just wrap these.
 */
import api from '../../../lib/api';
import { getExample } from '../../examples/api';
import type {
  CreateReportRequest,
  Page,
  ReportResponse,
  ReportSummary,
  TranslatedReport,
  UpdateReportRequest,
} from '../../../types/api';

/**
 * The unified shape the report viewer expects regardless of whether the
 * row came from `/reports/:id` (user-owned) or `/examples/:id` (global,
 * read-only). The `source` discriminator drives write-affordance gating
 * at the component level.
 */
export type ReportWithSource = ReportResponse & { source: 'report' | 'example' };

/** Paginated list of the caller's reports, newest first. */
export async function listReports(params: { page: number; size: number }) {
  const res = await api.get<Page<ReportSummary>>('/reports', {
    params: { page: params.page, size: params.size, sort: 'createdAt,desc' },
  });
  return res.data;
}

/**
 * Fetch a single row by id. Tries `/reports/:id` first; on a 404 it
 * delegates to `features/examples/api/getExample` so the viewer route
 * can resolve either kind under the unified `/reports/:id` URL. The
 * returned object always carries the `source` discriminator so
 * consumers can gate write affordances appropriately.
 */
export async function getReport(id: string): Promise<ReportWithSource> {
  try {
    const res = await api.get<ReportResponse>(`/reports/${id}`);
    return { ...res.data, source: 'report' as const };
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status !== 404) throw err;
    const ex = await getExample(id);
    return {
      id: ex.id,
      title: ex.title,
      status: 'COMPLETED' as const,
      inputData: ex.inputData,
      resultData: ex.resultData,
      primaryLanguage: ex.primaryLanguage,
      availableLanguages: ex.availableLanguages,
      // Examples don't carry a tighten cache — the PDF export pipeline
      // tightens fresh on every example export (rare action, fine to
      // skip the caching layer).
      pdfOptimized: null,
      createdAt: ex.createdAt,
      updatedAt: ex.updatedAt,
      source: 'example' as const,
    };
  }
}

export async function createReport(body: CreateReportRequest) {
  const res = await api.post<ReportResponse>('/reports', body);
  return res.data;
}

export async function updateReport(id: string, body: UpdateReportRequest) {
  const res = await api.patch<ReportResponse>(`/reports/${id}`, body);
  return res.data;
}

export async function deleteReport(id: string) {
  await api.delete(`/reports/${id}`);
}

/**
 * Record a "click Generate" event for a report. Gates against the user's
 * per-period quota on the Kinde plan and increments the counter when the
 * gate passes. Called by the wizard's Generate handler RIGHT BEFORE the
 * parallel Anthropic batch fires, so no AI tokens are spent when the
 * gate rejects (HTTP 429 or 402).
 *
 * <p>Every call counts on purpose — regenerating a completed report also
 * consumes a slot.
 */
export async function startGeneration(reportId: string) {
  await api.post(`/reports/${reportId}/generate`);
}

/**
 * Translate a report into a target language. Cached per (report ×
 * language) on the backend — the first call for a given pair takes
 * 10–30s, subsequent calls return the stored payload instantly. Pass
 * `force` to bypass the backend cache and re-translate (e.g. after the
 * source report has been edited).
 *
 * <p>This is the unary endpoint; for the SSE-streamed progress variant
 * see translateReportStream() in ./translateStream.ts.
 */
export async function translateReport(args: {
  id: string;
  targetLanguage: 'es' | 'en' | 'ca';
  force?: boolean;
}) {
  const { id, targetLanguage, force = false } = args;
  const res = await api.post<TranslatedReport>(`/reports/${id}/translate`, null, {
    params: { targetLanguage, force },
  });
  return res.data;
}

/**
 * Drop a cached translation from a report. Backend is idempotent (no-op
 * when the language isn't materialised) and refuses to delete the
 * primary language.
 */
export async function deleteTranslation(args: { id: string; language: 'es' | 'en' | 'ca' }) {
  await api.delete(`/reports/${args.id}/translations/${args.language}`);
}
