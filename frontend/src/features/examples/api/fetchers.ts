import type { LanguageCode } from '../../../i18n/languages';
/**
 * Pure HTTP fetchers for the examples feature. Same pattern as
 * features/report/api/fetchers.ts.
 */
import api from '../../../lib/api';
import type {
  ExampleResponse,
  ExampleSummary,
  PromoteToExampleRequest,
  TranslatedReport,
} from '../../../types/api';

/** List every example. Read-only and global — every authenticated user
 *  sees the same set. */
export async function listExamples() {
  const res = await api.get<ExampleSummary[]>('/examples');
  return res.data;
}

/** Fetch a single example by id. */
export async function getExample(id: string) {
  const res = await api.get<ExampleResponse>(`/examples/${id}`);
  return res.data;
}

/**
 * Promote a report into an example. DEV-only. Re-promoting with the
 * same slug overwrites the existing example. The source report is
 * deleted in the process.
 */
export async function promoteToExample(args: {
  reportId: string;
  body: PromoteToExampleRequest;
}) {
  const res = await api.post<ExampleResponse>(
    `/reports/${args.reportId}/promote-to-example`,
    args.body,
  );
  return res.data;
}

/**
 * Demote an example back to a private report owned by the calling DEV.
 * DEV-only. Returns the new report's id so the caller can navigate
 * straight to its viewer.
 */
export async function demoteExample(id: string) {
  const res = await api.post<{ reportId: string }>(`/examples/${id}/demote`);
  return res.data;
}

/** Delete an example. DEV-only. */
export async function deleteExample(id: string) {
  await api.delete(`/examples/${id}`);
}

/**
 * Translate an example. Cache-warm calls return instantly for any user;
 * cache-cold calls require DEV role.
 */
export async function translateExample(args: {
  id: string;
  targetLanguage: LanguageCode;
  force?: boolean;
}) {
  const { id, targetLanguage, force = false } = args;
  const res = await api.post<TranslatedReport>(`/examples/${id}/translate`, null, {
    params: { targetLanguage, force },
  });
  return res.data;
}

/** Drop a cached translation from an example. DEV-only. */
export async function deleteExampleTranslation(args: {
  id: string;
  language: LanguageCode;
}) {
  await api.delete(`/examples/${args.id}/translations/${args.language}`);
}
