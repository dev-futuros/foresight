/**
 * Layout-fit orchestrator for the PDF export pipeline.
 *
 * <p>Magazine-style PDF layouts have strict character budgets per field — Brief's exec summary
 * must fit one page next to the sidebar, STEEP wants ~600 chars per dimension column, scenario
 * descriptions cap at ~500 chars for the one-page layout, and so on. Source text from the AI
 * varies wildly: sometimes it falls within budget, sometimes it overshoots by 40%.
 *
 * <p>This module is the glue between section renderers and the {@code /api/ai/tighten}
 * endpoint:
 * <ol>
 *   <li>Each section declares its {@link FieldNeed}s — dotted path + source text + target
 *       budget + (optional) preserve terms.</li>
 *   <li>{@link runFitPass} checks the report's existing {@code pdfOptimized} cache for the
 *       target language; anything already cached is reused.</li>
 *   <li>For everything else, it fires parallel {@code tighten} calls.</li>
 *   <li>It returns a single {@link TightenedMap} keyed by dotted path → tightened text
 *       (cached or freshly produced).</li>
 *   <li>The caller then renders with {@code tightened[path] ?? source} per field, and persists
 *       the freshly-tightened entries back to the report row via
 *       {@link import('./aiClient').savePdfOptimized}.</li>
 * </ol>
 *
 * <p>The orchestrator does NOT decide which layout to use — that's the section module's job,
 * since it has the typographic context to measure available space. The orchestrator only
 * solves the "I've decided I need these fields shortened to these lengths" problem.
 */

import { tighten, savePdfOptimized } from './aiClient';
import type { PdfOptimizedCache } from '../types/api';

/**
 * One field that needs to fit a character budget. {@code path} is the dotted key the cache
 * uses (e.g. {@code "executiveSummary"}, {@code "scenarios.0.firstMove"}). {@code source}
 * is the original text from the report; {@code targetChars} is the hard budget.
 *
 * <p>If {@code source.length <= targetChars} the orchestrator skips it entirely (no AI call,
 * no cache write) — the source is already within budget. The caller should still render with
 * the source text in that case.
 *
 * <p>{@code preserveTerms} are domain terms the model must keep verbatim — proper nouns,
 * percentages, regulation names. Worth passing the company name + a few key statistics for
 * any field touching the brief.
 */
export interface FieldNeed {
  path: string;
  source: string;
  targetChars: number;
  preserveTerms?: string[];
}

/** Tightened text keyed by dotted path. Cache hits + fresh tighten responses both land here. */
export type TightenedMap = Record<string, string>;

/**
 * Run the fit-pass: consult cache, fire parallel tighten calls for anything missing, return a
 * unified {@link TightenedMap}. Throws on any tighten failure (matches the user's chosen
 * "fail the export with a clear error" policy — silent fallback to overflowing layouts is
 * worse UX than asking the user to retry).
 *
 * @param needs           one entry per field the section wants to shorten
 * @param language        target language tag — keys into the report's pdfOptimized cache
 * @param cache           report's existing pdfOptimized cache (from ReportResponse), may be null
 * @returns a map of dotted path → tightened text. Paths whose source was already within
 *          budget are absent — callers should fall back to the source text for those.
 */
export async function runFitPass(
  needs: FieldNeed[],
  language: 'es' | 'en' | 'ca',
  cache: PdfOptimizedCache | null,
): Promise<TightenedMap> {
  if (needs.length === 0) return {};
  const out: TightenedMap = {};
  const cachedFields = cache?.[language]?.fields ?? {};
  const todo: FieldNeed[] = [];
  for (const n of needs) {
    // Source already fits — render with original. No cache, no AI call.
    if (n.source.length <= n.targetChars) continue;
    // Cache hit AND the cached version actually fits the budget — reuse.
    const cached = cachedFields[n.path];
    if (cached && cached.length <= n.targetChars) {
      out[n.path] = cached;
      continue;
    }
    todo.push(n);
  }
  if (todo.length === 0) return out;
  // Fire all tighten calls in parallel. Promise.all rejects on any single failure, which
  // matches the chosen failure policy (caller surfaces a clear error to the user).
  //
  // We TRUST whatever the AI returns — no truncation. The layout chooser (upstream of this
  // call) picked a layout whose budget is within reasonable shortening distance of the
  // source content, so Haiku should always be able to hit the target. If it doesn't on a
  // given call, the layout might breathe a little wider than intended, but content is
  // preserved verbatim. Truncation would silently destroy meaning and is explicitly off.
  const results = await Promise.all(
    todo.map(async (n) => {
      const tightened = await tighten({
        text: n.source,
        targetChars: n.targetChars,
        language,
        preserveTerms: n.preserveTerms,
      });
      return [n.path, tightened] as const;
    }),
  );
  for (const [path, text] of results) {
    out[path] = text;
  }
  return out;
}

/**
 * Convenience accessor: given a {@link TightenedMap} and the source text for a path, return
 * the tightened version when available or fall back to the source. Used at the render seam
 * in each section module so the "use tightened if we have it" branch reads cleanly.
 */
export function pickText(tightened: TightenedMap, path: string, source: string): string {
  return tightened[path] ?? source;
}

/**
 * Persist freshly-tightened fields back to the report row's pdfOptimized cache. Best-effort
 * — failures are logged but don't break the export, since the PDF has already been
 * generated by the time we get here. The next export of the same report will just re-tighten
 * those fields.
 *
 * <p>Skips the write entirely when {@code tightened} is empty — no point storing a stub.
 */
export async function persistTightened(
  reportId: string,
  language: 'es' | 'en' | 'ca',
  tightened: TightenedMap,
): Promise<void> {
  if (Object.keys(tightened).length === 0) return;
  try {
    await savePdfOptimized(reportId, language, tightened);
  } catch (err) {
    // Don't break the export; the user already has their PDF.

    console.warn('[pdfFit] failed to persist tightened cache', err);
  }
}
