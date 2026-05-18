/**
 * Public surface of the report feature's API layer. Consumers should
 * import from `features/report/api` rather than reaching into the
 * individual files — that keeps the public/private split refactor-
 * resistant.
 */
export { reportKeys } from './queryKeys';
export type { ReportWithSource } from './fetchers';
export { useReports, useReport } from './queries';
export {
  useCreateReport,
  useUpdateReport,
  useStartGeneration,
  useDeleteReport,
  useTranslateReport,
  useDeleteTranslation,
} from './mutations';
export { translateReportStream, type TranslateProgress } from './translateStream';

// AI proxy endpoints (moved from lib/aiClient.ts in Phase 3).
export {
  analyze,
  analyzeScan,
  analyzeSummary,
  analyzeScenarios,
  analyzeScenarioPlanning,
  analyzeBackcasting,
  analyzeStrategicMap,
  analyzeSources,
} from './analyze';
export { suggestSteep, suggestHorizon } from './suggest';
export { globalSteep, globalSteepScan, globalSteepDim } from './steep';
export { tighten, savePdfOptimized } from './tighten';
