import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

// Mock the five analyze section calls before importing the hook so the
// hook closes over the mocks. Each mock returns an AnalyzeSectionResponse
// shape — {result, citations} — that the merge step expects.
const analyzeSummaryMock = vi.fn();
const analyzeScenariosMock = vi.fn();
const analyzeScenarioPlanningMock = vi.fn();
const analyzeStrategicMapMock = vi.fn();
const analyzeBackcastingMock = vi.fn();

vi.mock('../features/report/api', () => ({
  analyzeSummary: (...args: unknown[]) => analyzeSummaryMock(...args),
  analyzeScenarios: (...args: unknown[]) => analyzeScenariosMock(...args),
  analyzeScenarioPlanning: (...args: unknown[]) => analyzeScenarioPlanningMock(...args),
  analyzeStrategicMap: (...args: unknown[]) => analyzeStrategicMapMock(...args),
  analyzeBackcasting: (...args: unknown[]) => analyzeBackcastingMock(...args),
}));

import {
  useAnalysisPipeline,
  type AnalysisSectionKey,
} from '../features/report/hooks/useAnalysisPipeline';
import type { AnalyzeArgs, SourceItem } from '../types/api';

beforeEach(() => {
  analyzeSummaryMock.mockReset();
  analyzeScenariosMock.mockReset();
  analyzeScenarioPlanningMock.mockReset();
  analyzeStrategicMapMock.mockReset();
  analyzeBackcastingMock.mockReset();
  // Suppress the [analyze:KEY] failed console.errors from rejected
  // sections — they're intentional in the hook but noisy in test output.
  vi.spyOn(console, 'error').mockImplementation(() => {
    // intentionally silent
  });
});

const ARGS: AnalyzeArgs = {
  companyProfile: { name: 'Acme' },
  steep: {},
  horizon: {},
  language: 'es',
};

/** Sets every section mock to resolve with the supplied shape. */
function mockAllFulfilled(overrides?: Partial<Record<AnalysisSectionKey, unknown>>) {
  const defaults = {
    summary: { result: { executiveSummary: 'all good' }, citations: [] },
    scenarios: { result: { scenarios: [] }, citations: [] },
    planning: { result: { intro: 'p' }, citations: [] },
    strategicMap: { result: [], citations: [] },
    backcasting: { result: [], citations: [] },
    ...overrides,
  };
  analyzeSummaryMock.mockResolvedValue(defaults.summary);
  analyzeScenariosMock.mockResolvedValue(defaults.scenarios);
  analyzeScenarioPlanningMock.mockResolvedValue(defaults.planning);
  analyzeStrategicMapMock.mockResolvedValue(defaults.strategicMap);
  analyzeBackcastingMock.mockResolvedValue(defaults.backcasting);
}

describe('useAnalysisPipeline — initial state', () => {
  it('starts with all sections pending and counters at zero', () => {
    const { result } = renderHook(() => useAnalysisPipeline());
    expect(result.current.status).toEqual({
      summary: 'pending',
      scenarios: 'pending',
      planning: 'pending',
      strategicMap: 'pending',
      backcasting: 'pending',
    });
    expect(result.current.chars).toEqual({
      summary: 0,
      scenarios: 0,
      planning: 0,
      strategicMap: 0,
      backcasting: 0,
    });
    expect(result.current.sources).toEqual({
      summary: 0,
      scenarios: 0,
      planning: 0,
      strategicMap: 0,
      backcasting: 0,
    });
  });
});

describe('useAnalysisPipeline — happy path', () => {
  it('returns a merged resultData with every successful section', async () => {
    mockAllFulfilled({
      summary: {
        result: { executiveSummary: 'big picture', keyUncertainties: [{ name: 'rates' }] },
        citations: [],
      },
      scenarios: {
        result: {
          scenarios: [
            { type: 'Probable', name: 'Slow burn' },
            { type: 'Plausible', name: 'Pivot' },
          ],
        },
        citations: [],
      },
      planning: { result: { intro: 'planning intro' }, citations: [] },
      strategicMap: { result: [{ horizon: 'H1', title: 'Move 1' }], citations: [] },
      backcasting: {
        result: [
          {
            scenarioType: 'Probable',
            scenarioName: 'PLACEHOLDER',
            visionStatement: 'v',
            startingPoint: 's',
          },
        ],
        citations: [],
      },
    });

    const { result } = renderHook(() => useAnalysisPipeline());
    let merged!: Record<string, unknown>;
    await act(async () => {
      merged = await result.current.run(ARGS, []);
    });

    expect(merged.executiveSummary).toBe('big picture');
    expect(merged.scenarios).toHaveLength(2);
    expect((merged.scenarios as { name: string }[])[0].name).toBe('Slow burn');
    expect(merged.scenarioPlanning).toEqual({ intro: 'planning intro' });
    expect(merged.strategicMap).toEqual([{ horizon: 'H1', title: 'Move 1' }]);
    // Backcasting's placeholder scenarioName is patched with the
    // matching evocative name from the scenarios call.
    expect((merged.backcasting as { scenarioName: string }[])[0].scenarioName).toBe('Slow burn');
  });

  it("transitions every section's status from pending → running → done", async () => {
    mockAllFulfilled();
    const { result } = renderHook(() => useAnalysisPipeline());
    await act(async () => {
      await result.current.run(ARGS, []);
    });
    await waitFor(() => {
      expect(result.current.status).toEqual({
        summary: 'done',
        scenarios: 'done',
        planning: 'done',
        strategicMap: 'done',
        backcasting: 'done',
      });
    });
  });

  it('updates chars + sources counters from each section progress callback', async () => {
    const summaryArgsCapture = vi.fn();
    analyzeSummaryMock.mockImplementation(async (_args, onProgress) => {
      summaryArgsCapture();
      onProgress?.({ chars: 100, sources: 3 });
      onProgress?.({ chars: 500, sources: 7 });
      return { result: { executiveSummary: 's' }, citations: [] };
    });
    analyzeScenariosMock.mockResolvedValue({ result: { scenarios: [] }, citations: [] });
    analyzeScenarioPlanningMock.mockResolvedValue({ result: {}, citations: [] });
    analyzeStrategicMapMock.mockResolvedValue({ result: [], citations: [] });
    analyzeBackcastingMock.mockResolvedValue({ result: [], citations: [] });

    const { result } = renderHook(() => useAnalysisPipeline());
    await act(async () => {
      await result.current.run(ARGS, []);
    });

    expect(summaryArgsCapture).toHaveBeenCalledTimes(1);
    expect(result.current.chars.summary).toBe(500);
    expect(result.current.sources.summary).toBe(7);
  });
});

describe('useAnalysisPipeline — partial failure', () => {
  it('returns resultData with only the fulfilled sections; rejected sections are absent', async () => {
    mockAllFulfilled({
      summary: { result: { executiveSummary: 'ok' }, citations: [] },
      planning: { result: { intro: 'ok' }, citations: [] },
      strategicMap: { result: [{ horizon: 'H1', title: 't' }], citations: [] },
      backcasting: { result: [], citations: [] },
    });
    analyzeScenariosMock.mockRejectedValueOnce(new Error('scenarios down'));

    const { result } = renderHook(() => useAnalysisPipeline());
    let merged!: Record<string, unknown>;
    await act(async () => {
      merged = await result.current.run(ARGS, []);
    });

    expect(merged.executiveSummary).toBe('ok');
    expect(merged.scenarios).toBeUndefined();
    expect(merged.scenarioPlanning).toEqual({ intro: 'ok' });
  });

  it("flips a rejected section's status to 'error' but leaves the others 'done'", async () => {
    mockAllFulfilled();
    analyzeBackcastingMock.mockRejectedValueOnce(new Error('backcasting down'));

    const { result } = renderHook(() => useAnalysisPipeline());
    await act(async () => {
      await result.current.run(ARGS, []);
    });

    expect(result.current.status.backcasting).toBe('error');
    expect(result.current.status.summary).toBe('done');
    expect(result.current.status.scenarios).toBe('done');
    expect(result.current.status.planning).toBe('done');
    expect(result.current.status.strategicMap).toBe('done');
  });
});

describe('useAnalysisPipeline — sources aggregation', () => {
  it('builds the per-section + flat-deduped + globalSteep buckets', async () => {
    const summaryCitations: SourceItem[] = [
      { title: 'A', url: 'https://a.example' },
      { title: 'shared', url: 'https://shared.example' },
    ];
    const scenariosCitations: SourceItem[] = [
      { title: 'B', url: 'https://b.example' },
      { title: 'shared', url: 'https://shared.example' }, // duplicate of summary's
    ];
    const globalSteepCitations: SourceItem[] = [
      { title: 'GS', url: 'https://gs.example' },
      { title: 'GS', url: 'https://gs.example' }, // self-duplicate
    ];

    mockAllFulfilled({
      summary: { result: { executiveSummary: 's' }, citations: summaryCitations },
      scenarios: { result: { scenarios: [] }, citations: scenariosCitations },
    });

    const { result } = renderHook(() => useAnalysisPipeline());
    let merged!: Record<string, unknown>;
    await act(async () => {
      merged = await result.current.run(ARGS, globalSteepCitations);
    });

    const sources = merged.sources as {
      report: SourceItem[];
      bySection: Record<'A' | 'B' | 'C' | 'D' | 'E', SourceItem[]>;
      globalSteep: SourceItem[];
    };
    // Per-section bucket A (summary) gets its raw citations verbatim.
    expect(sources.bySection.A).toEqual(summaryCitations);
    expect(sources.bySection.B).toEqual(scenariosCitations);
    // Flat report list is deduped by URL — the shared citation appears once.
    const urls = sources.report.map((s) => s.url);
    expect(urls).toEqual(['https://a.example', 'https://shared.example', 'https://b.example']);
    // globalSteep is also deduped.
    expect(sources.globalSteep).toEqual([{ title: 'GS', url: 'https://gs.example' }]);
  });

  it('omits the sources block entirely when both buckets are empty', async () => {
    mockAllFulfilled(); // every section returns citations: []
    const { result } = renderHook(() => useAnalysisPipeline());
    let merged!: Record<string, unknown>;
    await act(async () => {
      merged = await result.current.run(ARGS, []);
    });
    expect(merged.sources).toBeUndefined();
  });

  it('emits a sources block when only globalSteep citations exist', async () => {
    mockAllFulfilled();
    const { result } = renderHook(() => useAnalysisPipeline());
    let merged!: Record<string, unknown>;
    await act(async () => {
      merged = await result.current.run(ARGS, [{ title: 'GS', url: 'https://gs.example' }]);
    });
    expect(merged.sources).toBeDefined();
    expect((merged.sources as { globalSteep: SourceItem[] }).globalSteep).toHaveLength(1);
  });
});

describe('useAnalysisPipeline — reset on every run', () => {
  it('clears chars/sources back to zero at the start of a subsequent run', async () => {
    // First run leaves counters > 0.
    analyzeSummaryMock.mockImplementationOnce(async (_args, onProgress) => {
      onProgress?.({ chars: 200, sources: 4 });
      return { result: { executiveSummary: 's' }, citations: [] };
    });
    analyzeScenariosMock.mockResolvedValueOnce({ result: { scenarios: [] }, citations: [] });
    analyzeScenarioPlanningMock.mockResolvedValueOnce({ result: {}, citations: [] });
    analyzeStrategicMapMock.mockResolvedValueOnce({ result: [], citations: [] });
    analyzeBackcastingMock.mockResolvedValueOnce({ result: [], citations: [] });

    const { result } = renderHook(() => useAnalysisPipeline());
    await act(async () => {
      await result.current.run(ARGS, []);
    });
    expect(result.current.chars.summary).toBe(200);

    // Second run — summary mock doesn't fire onProgress.
    analyzeSummaryMock.mockResolvedValueOnce({ result: { executiveSummary: 's' }, citations: [] });
    analyzeScenariosMock.mockResolvedValueOnce({ result: { scenarios: [] }, citations: [] });
    analyzeScenarioPlanningMock.mockResolvedValueOnce({ result: {}, citations: [] });
    analyzeStrategicMapMock.mockResolvedValueOnce({ result: [], citations: [] });
    analyzeBackcastingMock.mockResolvedValueOnce({ result: [], citations: [] });
    await act(async () => {
      await result.current.run(ARGS, []);
    });
    // Without the reset, this would still read 200 from the first run.
    expect(result.current.chars.summary).toBe(0);
  });
});
