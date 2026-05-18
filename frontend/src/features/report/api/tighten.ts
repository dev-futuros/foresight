import type { LanguageCode } from '../../../i18n/languages';
/**
 * PDF-export support endpoints.
 *
 * {@link tighten} shortens prose to fit a strict character budget,
 * preserving meaning and supplied verbatim terms. Used exclusively by
 * the PDF export pipeline when content overflows its chosen magazine
 * layout. Returns the new text.
 *
 * {@link savePdfOptimized} persists the per-language tighten cache
 * back to the report row so repeat exports skip the LLM round-trip.
 */
import api from '../../../lib/api';

export async function tighten(args: {
  text: string;
  targetChars: number;
  language: LanguageCode;
  /** Optional terms (proper nouns, percentages, regulation names…) the
   *  model MUST keep verbatim in the output. Up to 32 entries. */
  preserveTerms?: string[];
}): Promise<string> {
  const { data } = await api.post<{ text: string }>('ai/tighten', args);
  return data.text ?? '';
}

/**
 * Persist the per-language PDF-optimized tighten cache. Backend route:
 * PUT /api/reports/{id}/pdf-optimized/{language}. Pass an empty
 * `fields` map to clear the cache for that language (used when the
 * chosen layout didn't need tightening, so we don't leave a stale
 * empty row behind).
 */
export async function savePdfOptimized(
  reportId: string,
  language: LanguageCode,
  fields: Record<string, string>,
): Promise<void> {
  await api.put(`reports/${reportId}/pdf-optimized/${language}`, { fields });
}
