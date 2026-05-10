import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateReport, useUpdateReport } from './useReports';
import { EXAMPLE_REPORT_TITLE } from '../lib/exampleReport';
import type { Page, ReportSummary } from '../types/api';

/**
 * Encapsulates the "Load example" flow so multiple entry points (the
 * onboarding dialog on {@code /reports/new}, the always-visible button in
 * the dashboard header, the assistant {@code loadExample} command) can
 * share a single implementation.
 *
 * <p>Behaviour:
 * <ol>
 *   <li>Fetch {@code /public/example-report.json}.</li>
 *   <li>Reuse-by-title: scan the cached reports list ({@code useReports(0, 20)})
 *     for a row whose title matches {@link EXAMPLE_REPORT_TITLE}. If found,
 *     navigate to it — no POST, no duplicate row.</li>
 *   <li>Otherwise POST {@code inputData} (creates a DRAFT row), then PATCH
 *     {@code resultData} so the report renders as a finished analysis. Then
 *     navigate to its viewer.</li>
 *   <li>If the JSON has no {@code resultData} (legacy shape): create a
 *     DRAFT-only row and still navigate, so the user lands on the empty
 *     report viewer where they can re-run the analysis. This branch is
 *     a safety net — current example-report.json always ships resultData.</li>
 * </ol>
 *
 * <p>{@link isLoading} is true throughout the POST+PATCH sequence. Consumers
 * typically render a {@code LoadingOverlay} bound to it so the user has
 * feedback during the two HTTP round-trips.
 */
export function useLoadExample() {
  const navigate = useNavigate();
  const createReport = useCreateReport();
  const updateReport = useUpdateReport();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const loadExample = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/example-report.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        companyProfile?: Record<string, unknown> | null;
        globalSteep?: Record<string, unknown> | null;
        steep?: Record<string, unknown> | null;
        horizon?: Record<string, unknown> | null;
        resultData?: Record<string, unknown>;
      };

      // Reuse-by-title to avoid spawning a duplicate every click. The
      // dashboard's useReports query primes the cache on mount, so this
      // is usually instant. Even on a cold cache, hitting the existing
      // report fast is acceptable — duplicates would be a worse UX.
      const cachedReports = queryClient.getQueryData<Page<ReportSummary>>([
        'reports',
        0,
        20,
      ]);
      const existing = cachedReports?.content.find(
        (r) => r.title === EXAMPLE_REPORT_TITLE,
      );
      if (existing) {
        navigate(`/reports/${existing.id}`);
        return;
      }

      const title =
        (data.companyProfile as { title?: string } | null | undefined)?.title ||
        EXAMPLE_REPORT_TITLE;
      const inputData = {
        companyProfile: data.companyProfile ?? null,
        globalSteep: data.globalSteep ?? null,
        steep: data.steep ?? null,
        horizon: data.horizon ?? null,
      };
      const created = await createReport.mutateAsync({ title, inputData });
      if (data.resultData) {
        await updateReport.mutateAsync({
          id: created.id,
          body: { resultData: data.resultData },
        });
      }
      navigate(`/reports/${created.id}`);
    } catch (err) {
      // Non-blocking: log and let the caller decide on UX recovery. The
      // common case is a transient network blip; the user can re-click.
      // eslint-disable-next-line no-console
      console.error('[useLoadExample] failed', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [navigate, createReport, updateReport, queryClient]);

  return { loadExample, isLoading };
}
