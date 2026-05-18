import type { LanguageCode } from '../../../i18n/languages';
/**
 * Global STEEP endpoints — the macro context scan that pre-fills step 2
 * of the wizard. Three variants:
 *   • {@link globalSteep}     — unary, all five dimensions in one call
 *   • {@link globalSteepScan} — phase 1, streamed: one web_search call
 *                                returns raw dated bullets for all five
 *                                dimensions in a single JSON
 *   • {@link globalSteepDim}  — phase 2, streamed: reformulates a single
 *                                dimension from the scan output (no
 *                                further web_search)
 *
 * The split-flow (scan + dim) is the demo's scan-then-analyse pattern
 * applied to step 2: cuts web_search budget down from 5+ calls to 1.
 */
import api from '../../../lib/api';
import { parseJson, type AnthropicResponse } from '../../../lib/anthropicJson';
import { streamSse } from './analyze';
import { parseJsonText } from '../../../lib/anthropicJson';
import type {
  GlobalSteep,
  GlobalSteepDimension,
  ProgressCallback,
  SourceItem,
} from '../../../types/api';

export async function globalSteep(args: {
  sector: string;
  language: LanguageCode;
  dimension?: GlobalSteepDimension;
}): Promise<Partial<GlobalSteep>> {
  // When `dimension` is set the backend returns a single-key payload
  // (e.g. {"P":"..."}); without it, all five keys come back.
  const { data } = await api.post<AnthropicResponse>('ai/global-steep', args);
  return parseJson<Partial<GlobalSteep>>(data);
}

/**
 * Phase 1 of the split Global STEEP flow. Runs ONE web-search call on
 * the backend and returns raw dated bullets for all five dimensions in
 * a single JSON. Pair with {@link globalSteepDim}.
 */
export async function globalSteepScan(
  args: { sector: string; language: LanguageCode },
  onProgress?: ProgressCallback,
): Promise<{ result: Partial<GlobalSteep>; citations: SourceItem[] }> {
  return streamSse<typeof args, Partial<GlobalSteep>>(
    'ai/global-steep-scan',
    args,
    (text) => parseJsonText<Partial<GlobalSteep>>(text),
    onProgress,
  );
}

/**
 * Phase 2 of the split Global STEEP flow — streamed. No web_search, so
 * the {@code onProgress} callback will only carry character counts.
 * The model emits plain prose; the parser trims whitespace + any
 * surrounding quote artefacts (the backend tries to avoid them, this
 * is the safety net).
 */
export async function globalSteepDim(
  args: {
    sector: string;
    language: LanguageCode;
    dimension: GlobalSteepDimension;
    snippet: string;
  },
  onProgress?: ProgressCallback,
): Promise<string> {
  const res = await streamSse<typeof args, string>(
    'ai/global-steep-dim',
    args,
    (text) => text.replace(/^["']+|["']+$/g, '').trim(),
    onProgress,
  );
  return res.result;
}
