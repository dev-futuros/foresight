import { useCallback, useState } from 'react';
import {
  analyzeBackcasting,
  analyzeScenarioPlanning,
  analyzeScenarios,
  analyzeStrategicMap,
  analyzeSummary,
} from '../api';
import type { AnalyzeArgs, Scenario, SourceItem } from '../../../types/api';

/** The five parallel analysis phases the pipeline runs. */
export type AnalysisSectionKey =
  | 'summary'
  | 'scenarios'
  | 'planning'
  | 'strategicMap'
  | 'backcasting';

/** Per-section render-status for the {@code LoadingPanel}. */
export type AnalysisSectionStatus = 'pending' | 'running' | 'done' | 'error';

const SECTION_KEYS: readonly AnalysisSectionKey[] = [
  'summary',
  'scenarios',
  'planning',
  'strategicMap',
  'backcasting',
] as const;

const ZERO_RECORD: Record<AnalysisSectionKey, 0> = {
  summary: 0,
  scenarios: 0,
  planning: 0,
  strategicMap: 0,
  backcasting: 0,
};
const PENDING_STATUS: Record<AnalysisSectionKey, AnalysisSectionStatus> = {
  summary: 'pending',
  scenarios: 'pending',
  planning: 'pending',
  strategicMap: 'pending',
  backcasting: 'pending',
};
const RUNNING_STATUS: Record<AnalysisSectionKey, AnalysisSectionStatus> = {
  summary: 'running',
  scenarios: 'running',
  planning: 'running',
  strategicMap: 'running',
  backcasting: 'running',
};

export interface UseAnalysisPipelineReturn {
  /** Per-section render-status. Starts at 'pending'; flips to 'running'
   *  for all five when {@link run} fires, then each section transitions
   *  independently to 'done' or 'error' as its call resolves. */
  status: Record<AnalysisSectionKey, AnalysisSectionStatus>;
  /** Running total of characters streamed per section. */
  chars: Record<AnalysisSectionKey, number>;
  /** Running count of unique source URLs harvested per section. */
  sources: Record<AnalysisSectionKey, number>;
  /**
   * Fire all five section calls in parallel via {@code Promise.allSettled},
   * merge the successful sections into a single {@code resultData} blob,
   * patch backcasting entries with the matching 3P scenario name, and
   * aggregate web_search citations into the report's Sources tab buckets
   * (per-section + flat-deduped + the supplied global-STEEP citations).
   *
   * <p>Partial-failure tolerant: sections that reject are skipped from
   * {@code resultData} (the renderer's tabs handle their absence with
   * an empty-state). Rejects only if every section throws AND aggregating
   * the result blob throws — in practice this is a Promise.allSettled
   * call so it almost never rejects.
   *
   * @returns the merged {@code resultData} ready to PATCH onto the report row
   */
  run: (
    args: AnalyzeArgs,
    globalSteepCitations: readonly SourceItem[],
  ) => Promise<Record<string, unknown>>;
}

/**
 * Orchestrates the wizard's five-way parallel analysis pipeline.
 *
 * <p>State machine: every section starts {@code pending}; {@link run}
 * flips them all to {@code running} and clears chars/sources, then each
 * section's progress callback streams updates and its done/error
 * handler transitions it to the terminal state. The page renders the
 * status panel directly off these three records.
 *
 * <p>The hook owns the analysis-domain state ONLY — billing gates,
 * persist-before-run, navigate-after-success, and "isGenerating" flag
 * management stay with the caller. The split lets the caller cancel /
 * branch around the analysis without the hook having to know about
 * any of those concerns.
 */
export function useAnalysisPipeline(): UseAnalysisPipelineReturn {
  const [status, setStatus] =
    useState<Record<AnalysisSectionKey, AnalysisSectionStatus>>(PENDING_STATUS);
  const [chars, setChars] = useState<Record<AnalysisSectionKey, number>>(ZERO_RECORD);
  const [sources, setSources] = useState<Record<AnalysisSectionKey, number>>(ZERO_RECORD);

  const run = useCallback(
    async (
      args: AnalyzeArgs,
      globalSteepCitations: readonly SourceItem[],
    ): Promise<Record<string, unknown>> => {
      // Reset progress on every run. The status flips back to 'pending'
      // BEFORE the next paint flips it to 'running' — keeps the loader
      // panel from briefly showing the previous run's 'done' states
      // through the gap.
      setStatus(RUNNING_STATUS);
      setChars(ZERO_RECORD);
      setSources(ZERO_RECORD);

      const onProgress =
        (key: AnalysisSectionKey) => (p: { chars: number; sources: number }) => {
          setChars((prev) => (prev[key] === p.chars ? prev : { ...prev, [key]: p.chars }));
          setSources((prev) =>
            prev[key] === p.sources ? prev : { ...prev, [key]: p.sources },
          );
        };
      const onDone =
        <T,>(key: AnalysisSectionKey) =>
        (r: T): T => {
          setStatus((p) => ({ ...p, [key]: 'done' }));
          return r;
        };
      // The console.error here is intentional: Promise.allSettled
      // swallows individual rejections, so without this the loader
      // row turns red but the actual error never surfaces in dev
      // tools.
      const onError =
        (key: AnalysisSectionKey) =>
        (err: unknown): never => {
          setStatus((p) => ({ ...p, [key]: 'error' }));
          // eslint-disable-next-line no-console
          console.error(`[analyze:${key}] failed:`, err);
          throw err;
        };

      const [summary, scenarios, planning, strategicMap, backcasting] = await Promise.allSettled([
        analyzeSummary(args, onProgress('summary')).then(onDone('summary'), onError('summary')),
        analyzeScenarios(args, onProgress('scenarios')).then(
          onDone('scenarios'),
          onError('scenarios'),
        ),
        analyzeScenarioPlanning(args, onProgress('planning')).then(
          onDone('planning'),
          onError('planning'),
        ),
        analyzeStrategicMap(args, onProgress('strategicMap')).then(
          onDone('strategicMap'),
          onError('strategicMap'),
        ),
        analyzeBackcasting(args, onProgress('backcasting')).then(
          onDone('backcasting'),
          onError('backcasting'),
        ),
      ]);

      // ── Merge successful sections into the resultData blob ─────
      // Backcasting entries arrive with placeholder {@code scenarioName}
      // (the prompt has no access to the scenarios-call sibling's
      // evocative names). Patch them here so each entry shows the
      // matching name — mirrors the merge step in the demo's analysis.js.
      const fullResult: Record<string, unknown> = {};
      const scenarioList: Scenario[] =
        scenarios.status === 'fulfilled' ? (scenarios.value.result.scenarios ?? []) : [];
      const nameByType: Record<string, string | undefined> = {};
      for (const s of scenarioList) {
        if (s.type) nameByType[s.type] = s.name ?? s.title;
      }
      if (summary.status === 'fulfilled') {
        Object.assign(fullResult, summary.value.result);
      }
      if (scenarioList.length > 0) {
        fullResult.scenarios = scenarioList;
      }
      if (planning.status === 'fulfilled') {
        fullResult.scenarioPlanning = planning.value.result;
      }
      if (strategicMap.status === 'fulfilled') {
        fullResult.strategicMap = strategicMap.value.result;
      }
      if (backcasting.status === 'fulfilled') {
        fullResult.backcasting = backcasting.value.result.map((bc) => ({
          ...bc,
          scenarioName: nameByType[bc.scenarioType] ?? bc.scenarioName,
        }));
      }

      // ── Sources aggregation ───────────────────────────────────
      // Two buckets land in the report's Sources tab:
      //   report      — citations across all 5 section calls, deduped
      //                 into a flat list for the top-line view AND
      //                 keyed by section (A-E) for attribution.
      //   globalSteep — citations from the Step 2 globalSteepScan
      //                 (passed in by the caller; may be empty when
      //                 the user opened a saved draft without re-running
      //                 step 2).
      const sectionCitations: Record<'A' | 'B' | 'C' | 'D' | 'E', SourceItem[]> = {
        A: summary.status === 'fulfilled' ? summary.value.citations : [],
        B: scenarios.status === 'fulfilled' ? scenarios.value.citations : [],
        C: planning.status === 'fulfilled' ? planning.value.citations : [],
        D: strategicMap.status === 'fulfilled' ? strategicMap.value.citations : [],
        E: backcasting.status === 'fulfilled' ? backcasting.value.citations : [],
      };
      const dedup = (items: readonly SourceItem[]) => {
        const seen = new Map<string, SourceItem>();
        for (const c of items) {
          if (!seen.has(c.url)) seen.set(c.url, c);
        }
        return Array.from(seen.values());
      };
      const flatReportCitations = dedup([
        ...sectionCitations.A,
        ...sectionCitations.B,
        ...sectionCitations.C,
        ...sectionCitations.D,
        ...sectionCitations.E,
      ]);
      if (flatReportCitations.length > 0 || globalSteepCitations.length > 0) {
        fullResult.sources = {
          report: flatReportCitations,
          bySection: sectionCitations,
          globalSteep: dedup(globalSteepCitations),
        };
      }

      return fullResult;
    },
    [],
  );

  return { status, chars, sources, run };
}

// Keep the SECTION_KEYS export accessible for callers that need to
// iterate (e.g. UI loops over all five). Exported on a separate line
// rather than alongside the type alias to avoid the rare-but-real
// "value can't be exported as a type" eslint quirk.
export { SECTION_KEYS };
