import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCreateReport, useReport, useUpdateReport } from '../../hooks/useReports';
import LoadingOverlay from '../../components/LoadingOverlay';
import Modal from '../../components/Modal';
import { useCurrentUser } from '../../hooks/useAuth';
import { useSetStepper } from '../shell/StepperContext';
import {
  analyzeBackcasting,
  analyzeScan,
  analyzeScenarioPlanning,
  analyzeScenarios,
  analyzeStrategicMap,
  analyzeSummary,
  type SourceItem,
} from '../../lib/aiClient';
import { extractApiErrorMessage } from '../../lib/apiError';
import OnboardingDialog from '../../components/OnboardingDialog';
import LoadingPanel, {
  type ProgressItem,
  type ProgressItemStatus,
} from '../../components/LoadingPanel';
import { useCommands } from '../../lib/useCommands';
import { useSetAssistantContext } from '../chat/AssistantContextProvider';
import '../../components/modal.css';
import StepEmpresa, { type EmpresaData } from './steps/StepEmpresa';
import StepGlobal, { type GlobalSteepData } from './steps/StepGlobal';
import StepSteep, { type SteepData } from './steps/StepSteep';
import StepHorizon, { type HorizonData } from './steps/StepHorizon';
import './wizard.css';

/** localStorage key — once set to '1', the onboarding modal won't auto-show
 *  again on this device. Wins over the per-session flag below: a user who
 *  has explicitly checked "don't show again" never sees it again. */
const ONBOARDING_KEY = 'fs_onboarding_dismissed';
/** sessionStorage key — set to '1' after the dialog has been auto-shown
 *  once in this browser session. Stops the dialog from re-appearing every
 *  time the user clicks "New report" or revisits {@code /reports/new}; the
 *  "first entry" semantics are scoped to the session, not the device. */
const ONBOARDING_SESSION_KEY = 'fs_onboarding_seen_this_session';

function readOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}
function persistOnboardingDismissed() {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    /* private mode / quota — silently ignore */
  }
}
function readOnboardingSeenThisSession(): boolean {
  try {
    return sessionStorage.getItem(ONBOARDING_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}
function markOnboardingSeenThisSession() {
  try {
    sessionStorage.setItem(ONBOARDING_SESSION_KEY, '1');
  } catch {
    /* private mode / quota — silently ignore */
  }
}

const EMPTY_EMPRESA: EmpresaData = {
  name: '',
  sector: '',
  size: '',
  horizon: '5',
  market: 'local',
  challenge: '',
  strengths: '',
  consultantName: '',
  consultantCompany: '',
  title: '',
};
const EMPTY_STEEP: SteepData = {
  social: '',
  technological: '',
  economic: '',
  environmental: '',
  political: '',
};
const EMPTY_HORIZON: HorizonData = { H1: '', H2: '', H3: '' };
const EMPTY_GLOBAL_STEEP: GlobalSteepData = { S: '', T: '', E: '', ENV: '', P: '' };

export default function NewReportPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const createReport = useCreateReport();
  const updateReport = useUpdateReport();
  const { data: user } = useCurrentUser();

  // Mode detection. The /reports/:id/edit route renders this same component
  // in edit mode — we fetch the existing report, prefill the four state
  // slices once data lands, and PATCH on submit instead of POST.
  const params = useParams<{ id?: string }>();
  const editingId = params.id;
  const editMode = !!editingId;
  const editingReport = useReport(editingId ?? '');

  // Optional ?step=N — read once on mount so subsequent step changes don't
  // fight the URL. The user navigates internally via the stepper afterwards.
  const [searchParams] = useSearchParams();
  const initialStep = useMemo(() => {
    const raw = searchParams.get('step');
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n >= 1 && n <= 4 ? n : 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [step, setStep] = useState(initialStep);
  // Id of the persisted draft. Null in create mode until the user touches
  // something and we POST; thereafter (and from the start in edit mode) we
  // PATCH this id on every step transition. Once set, never goes back to
  // null — the same draft accumulates revisions across the whole session.
  const [reportId, setReportId] = useState<string | null>(editingId ?? null);
  // Combined create + analyze + update pipeline state. Set when the user
  // clicks "Generate analysis" on step 4 and stays true until either the
  // report is fully built (we navigate away) or the pipeline errors.
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  // Per-row status for the analysis loader checklist. Mirrors the demo's
  // scan-then-reformulate pattern: one up-front "research" row that runs
  // the web_search-enabled scan, then 5 parallel section rows that
  // anchor on the shared research bullets. The order here is the visual
  // order in the loader.
  const [analysisProgress, setAnalysisProgress] = useState<
    Record<
      'research' | 'summary' | 'scenarios' | 'planning' | 'strategicMap' | 'backcasting',
      ProgressItemStatus
    >
  >({
    research: 'pending',
    summary: 'pending',
    scenarios: 'pending',
    planning: 'pending',
    strategicMap: 'pending',
    backcasting: 'pending',
  });
  // Live progress counters for the research row (the only call that
  // touches web_search now). We track BOTH the source count AND the
  // streamed character count so the row keeps showing forward motion
  // after web_search stops adding URLs but the model is still writing
  // out the consolidated research bullets.
  const [researchSources, setResearchSources] = useState(0);
  const [researchChars, setResearchChars] = useState(0);
  // Live character count for each of the 5 section rows — the sections
  // no longer use web_search, so chars-streamed is the meaningful
  // progress signal. Updated from each analyzeX onProgress callback.
  const [sectionChars, setSectionChars] = useState<
    Record<
      'summary' | 'scenarios' | 'planning' | 'strategicMap' | 'backcasting',
      number
    >
  >({
    summary: 0,
    scenarios: 0,
    planning: 0,
    strategicMap: 0,
    backcasting: 0,
  });
  // Highest step the user has ever reached. Lets the stepper allow forward
  // jumps to already-visited steps in addition to back-nav. In edit mode
  // every step is already "reached" since the report was previously fully
  // submitted, so default to 4 (the last input step).
  const [maxReached, setMaxReached] = useState(editMode ? 4 : initialStep);
  // First-run welcome dialog. Lazy-init from storage so we don't flash the
  // dialog open on remount when the user has already dismissed it. Two
  // gates: (1) device-level dismissal via the "don't show again" checkbox
  // (localStorage), (2) session-level "already seen" flag (sessionStorage)
  // so revisiting /reports/new in the same session doesn't re-trigger it.
  // The session flag is set in an effect below the first time the dialog
  // appears, so subsequent navigations within the session are silent. Skip
  // in edit mode — the user has clearly used the wizard before.
  const [showOnboarding, setShowOnboarding] = useState(
    () =>
      !editMode &&
      !readOnboardingDismissed() &&
      !readOnboardingSeenThisSession(),
  );
  // Persist the session flag the first time we actually decided to show
  // the dialog this mount. Doing it in an effect (not in the useState
  // initializer) keeps StrictMode's double-invoke harmless — the initializer
  // can run twice, but the effect only runs once per real mount.
  useEffect(() => {
    if (showOnboarding) markOnboardingSeenThisSession();
    // Empty deps: we only need to record the very first showing. Later
    // setShowOnboarding(false) doesn't need to revisit this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleOnboardingClose = useCallback((dontShowAgain: boolean) => {
    if (dontShowAgain) persistOnboardingDismissed();
    setShowOnboarding(false);
  }, []);

  // Snapshot refs of the four wizard slices. Used by persistDraft so it
  // always sees the latest values without having to depend on them in its
  // useCallback (which would re-create it — and re-fire effects that depend
  // on it — every keystroke).
  const empresaRef = useRef<EmpresaData>(EMPTY_EMPRESA);
  const globalDataRef = useRef<GlobalSteepData>(EMPTY_GLOBAL_STEEP);
  const steepRef = useRef<SteepData>(EMPTY_STEEP);
  const horizonRef = useRef<HorizonData>(EMPTY_HORIZON);
  const reportIdRef = useRef<string | null>(editingId ?? null);
  // Tracks the sector for which the Step 2 auto-fetch has already been
  // attempted in this wizard session. Lifted here (out of StepGlobal)
  // so it survives StepGlobal's mount/unmount cycle when the user
  // navigates between steps — without this, going back to step 2 with
  // empty fields would unwantedly re-trigger the expensive generation.
  // Resets at component scope only — a fresh /new visit starts clean.
  // In edit mode we pre-claim the sector so opening an existing report
  // never auto-regenerates either.
  const globalSteepFetchedForRef = useRef<string | null>(null);

  /** Builds the inputData snapshot we PATCH/POST. Includes `currentStep` so
   *  reopening the draft resumes on the same page. */
  const buildInputData = useCallback(
    (currentStep: number) => ({
      companyProfile: empresaRef.current,
      globalSteep: globalDataRef.current,
      steep: steepRef.current,
      horizon: horizonRef.current,
      currentStep,
    }),
    [],
  );

  const buildTitle = useCallback((): string => {
    const e = empresaRef.current;
    const custom = e.title.trim();
    if (custom) return custom;
    if (e.name.trim()) return `${e.name} — Foresight ${new Date().getFullYear()}`;
    return t('report.draftUntitled');
  }, [t]);

  /** Has the user typed anything worth persisting? No empty-shell drafts. */
  function hasMeaningfulContent(): boolean {
    const e = empresaRef.current;
    return !!(e.name.trim() || e.sector.trim() || e.challenge.trim());
  }

  // Stable references to the mutation primitives. The `useMutation` hook
  // returns a fresh object on every render in TanStack Query v5 — using the
  // object directly as a useCallback dependency would re-create persistDraft
  // every render, which cascades into goToStep → handleStepperSelect →
  // stepperState → useSetStepper, triggering the StepperContext to clear and
  // re-set on every render. That cascade was costing the topbar Link clicks
  // (the AppShell re-rendered fast enough to drop them).
  // mutateAsync itself is stable across renders, so we depend on those
  // narrow handles instead.
  const createReportAsync = createReport.mutateAsync;
  const updateReportAsync = updateReport.mutateAsync;

  // Example mode — the user is exploring a global example through the
  // wizard. Inputs render exactly like a real report's, but every
  // would-be persistence path is short-circuited: no autosave, no
  // create-as-draft, no generate-analysis. The user can freely click
  // around the steps and edit fields; nothing leaves the page.
  const isExampleMode = editingReport.data?.source === 'example';
  const isExampleModeRef = useRef(isExampleMode);
  isExampleModeRef.current = isExampleMode;

  /** Persists a draft snapshot. POST on first call (no id yet), PATCH after.
   *  Fire-and-forget: errors are logged but never block UX — the user can
   *  keep editing and the next step transition will retry.
   *
   *  <p>Examples short-circuit before any HTTP call: their content lives
   *  in the {@code examples} table, not {@code reports}, so a PATCH
   *  against {@code /api/reports/:id} would 404 and a POST would create
   *  an unrelated new report. */
  const persistDraft = useCallback(
    async (currentStep: number): Promise<void> => {
      if (isExampleModeRef.current) return;
      if (!hasMeaningfulContent()) return;
      const title = buildTitle();
      const inputData = buildInputData(currentStep);
      try {
        if (reportIdRef.current) {
          await updateReportAsync({
            id: reportIdRef.current,
            body: { title, inputData },
          });
        } else {
          const created = await createReportAsync({ title, inputData });
          reportIdRef.current = created.id;
          setReportId(created.id);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[autosave] persistDraft failed', err);
      }
    },
    [buildInputData, buildTitle, createReportAsync, updateReportAsync],
  );

  // Mirror persistDraft into a ref so goToStep can stay stable (deps: []).
  // Without this every render of NewReportPage would yield a new goToStep,
  // a new handleStepperSelect, a new stepperState, and useSetStepper would
  // cycle the slot in StepperContext on every render.
  const persistDraftRef = useRef(persistDraft);
  persistDraftRef.current = persistDraft;

  const goToStep = useCallback((n: number) => {
    setStep(n);
    setMaxReached((prev) => Math.max(prev, n));
    // Autosave the snapshot under the *target* step — that's where the
    // user will resume next time. Don't await: the user moves on while
    // the request is in flight.
    void persistDraftRef.current(n);
  }, []);

  const language: 'es' | 'en' =
    user?.language === 'en' || i18n.language === 'en' ? 'en' : 'es';

  const [empresa, setEmpresa] = useState<EmpresaData>(EMPTY_EMPRESA);
  const [globalData, setGlobalData] = useState<GlobalSteepData>(EMPTY_GLOBAL_STEEP);
  const [steep, setSteep] = useState<SteepData>(EMPTY_STEEP);
  const [horizon, setHorizon] = useState<HorizonData>(EMPTY_HORIZON);
  // Citations harvested from Step 2's web_search-enabled scan. Held in
  // transient state until the user runs the full analysis, at which
  // point they're written into resultData.sources.globalSteep so the
  // Sources tab can render a dedicated "Global context (Step 2)"
  // bucket. Resets when the user re-runs the scan (StepGlobal sends a
  // fresh array via onCitations); not persisted in inputData on
  // purpose — only kept around for the in-flight wizard session.
  const [globalSteepCitations, setGlobalSteepCitations] = useState<SourceItem[]>([]);

  // Mirror the four slices into refs every render. persistDraft reads from
  // these so it always sees the freshest values without being rebuilt on
  // every keystroke (which would cascade through useCallback dependents).
  empresaRef.current = empresa;
  globalDataRef.current = globalData;
  steepRef.current = steep;
  horizonRef.current = horizon;
  reportIdRef.current = reportId;

  // Prefill the four state slices once when the existing report's data lands
  // (edit mode only). The ref guard prevents re-runs on later refetches that
  // would otherwise overwrite the user's in-progress edits.
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!editMode || !editingReport.data) return;
    if (prefilledFor.current === editingReport.data.id) return;
    prefilledFor.current = editingReport.data.id;

    const inputs = editingReport.data.inputData as {
      companyProfile?: Partial<EmpresaData>;
      globalSteep?: Partial<GlobalSteepData>;
      steep?: Partial<SteepData>;
      // Horizon historically had a couple of shapes: the canonical
      // {H1, H2, H3} the wizard saves today, plus lowercase variants
      // that surface when an example was promoted from a report
      // generated under an older schema. The normalizer below accepts
      // both so legacy examples don't render with empty H1/H2/H3 boxes.
      horizon?: Partial<HorizonData> & Partial<Record<'h1' | 'h2' | 'h3', string>>;
      currentStep?: number;
    };
    if (inputs.companyProfile) setEmpresa({ ...EMPTY_EMPRESA, ...inputs.companyProfile });
    if (inputs.globalSteep) setGlobalData({ ...EMPTY_GLOBAL_STEEP, ...inputs.globalSteep });
    if (inputs.steep) setSteep({ ...EMPTY_STEEP, ...inputs.steep });
    const horizonInput = inputs.horizon ?? {};
    const normalisedHorizon: HorizonData = {
      H1: horizonInput.H1 ?? horizonInput.h1 ?? '',
      H2: horizonInput.H2 ?? horizonInput.h2 ?? '',
      H3: horizonInput.H3 ?? horizonInput.h3 ?? '',
    };
    setHorizon(normalisedHorizon);
    // Surface a warning in dev if an example lands without horizon
    // content at all — usually means it was promoted from a report
    // saved before the wizard captured the H1/H2/H3 free-text inputs.
    // The DEV can re-promote a newer report to fix it.
    if (
        import.meta.env.DEV &&
        editingReport.data.source === 'example' &&
        !normalisedHorizon.H1 &&
        !normalisedHorizon.H2 &&
        !normalisedHorizon.H3
    ) {
      // eslint-disable-next-line no-console
      console.warn(
          '[wizard] example %s has no horizon scan inputs — re-promote a newer report to populate H1/H2/H3.',
          editingReport.data.id,
      );
    }
    // Pre-claim the global-steep auto-fetch ref when the loaded report
    // already has STEEP values for its sector. Without this, a user who
    // edits an existing report and clears the Global STEEP fields would
    // see them auto-regenerate on the next step-2 visit — the wizard's
    // policy is one auto-attempt per sector per session, regardless of
    // how that session got there.
    const loadedSector = inputs.companyProfile?.sector?.trim();
    const hasLoadedGlobalSteep =
        inputs.globalSteep &&
        (['S', 'T', 'E', 'ENV', 'P'] as const).some(
            (k) => (inputs.globalSteep![k] ?? '').trim().length > 0,
        );
    if (loadedSector && hasLoadedGlobalSteep) {
      globalSteepFetchedForRef.current = loadedSector;
    }
    // Resume on the step the user left off on, unless an explicit ?step=N in
    // the URL overrides it (initialStep already captured that). The URL
    // wins so back-nav from the report viewer's stepper still lands on the
    // step the user clicked, not the auto-saved one.
    const fromUrl = searchParams.get('step');
    if (!fromUrl && typeof inputs.currentStep === 'number') {
      const resumeAt = Math.min(Math.max(inputs.currentStep, 1), 4);
      setStep(resumeAt);
      setMaxReached((prev) => Math.max(prev, resumeAt));
    }
  }, [editMode, editingReport.data, searchParams]);

  // Step bar shows 5 navigable items — Analysis (step 5 internally) is the
  // transient loader the user lands on while generating, never a real
  // destination, so it's omitted from the stepper. Step 6 = Results lives
  // at the end and displays as position 5 via the Stepper's index-based
  // numbering. `n` values stay 1-6 so routing / goTo / edit-mode logic
  // doesn't need to renumber.
  const steps = useMemo(
    () => [
      { n: 1, label: t('wizard.steps.empresa') },
      { n: 2, label: t('wizard.steps.global') },
      { n: 3, label: t('wizard.steps.steep') },
      { n: 4, label: t('wizard.steps.horizon') },
      { n: 6, label: t('wizard.steps.results') },
    ],
    [t],
  );

  // Stepper click router. Steps 1-4 are wizard pages → goToStep. Step 6 in
  // edit mode jumps straight back to the report results without re-running
  // the analysis (only the "Generate" button on step 4 triggers a regen).
  // In create mode, step 6 stays "pending" (maxReached < 6) so it isn't
  // clickable to begin with — the n === 6 branch is a no-op there.
  const handleStepperSelect = useCallback(
    (n: number) => {
      if (n === 6 && editingId) {
        navigate(`/reports/${editingId}`);
        return;
      }
      if (n >= 1 && n <= 4) goToStep(n);
    },
    [editingId, navigate, goToStep],
  );

  // Push step state up to the AppShell so the sticky stepper renders below the
  // topbar. In edit mode every step is already "reached" (the report is fully
  // generated), so cap maxReached at 6 so step 6 renders as a clickable
  // destination back to the report page.
  const stepperState = useMemo(
    () => ({
      steps,
      current: step,
      maxReached: editMode ? 6 : maxReached,
      onSelect: handleStepperSelect,
    }),
    [steps, step, maxReached, editMode, handleStepperSelect],
  );
  useSetStepper(stepperState);

  const companyProfile = empresa.name
    ? `${empresa.name} — ${empresa.sector}. ${empresa.challenge}. (${empresa.horizon}y)`
    : '';

  async function handleSubmit() {
    // Block the analysis pipeline entirely when the user is exploring
    // an example through the wizard — examples are read-only content,
    // and a Generate click here would either 404 against /api/reports
    // or quietly spawn an unrelated new report under the user's account
    // (depending on whether reportId is set). The Generate button is
    // disabled in this mode too; this guard is defence in depth.
    if (isExampleMode) return;
    setGenerateError(null);
    setIsGenerating(true);
    // Reset loader state — research row starts running immediately, the
    // 5 section rows stay pending until research completes (they're
    // gated on it).
    setAnalysisProgress({
      research: 'running',
      summary: 'pending',
      scenarios: 'pending',
      planning: 'pending',
      strategicMap: 'pending',
      backcasting: 'pending',
    });
    setResearchSources(0);
    setResearchChars(0);
    setSectionChars({
      summary: 0,
      scenarios: 0,
      planning: 0,
      strategicMap: 0,
      backcasting: 0,
    });
    try {
      // 1. Make sure the latest inputs are persisted before we kick off
      //    the expensive analysis. In the common path the draft has
      //    already been saved on every step transition, so this is
      //    essentially a no-op PATCH that also creates the row on the
      //    unlikely path where the user typed nothing in steps 1-3 and
      //    only filled step 4.
      await persistDraft(4);
      const reportId = reportIdRef.current;
      if (!reportId) {
        // hasMeaningfulContent guard inside persistDraft skipped the POST.
        // Force one final create with whatever the user has so the analysis
        // result has somewhere to land.
        const created = await createReport.mutateAsync({
          title: buildTitle(),
          inputData: buildInputData(4),
        });
        reportIdRef.current = created.id;
        setReportId(created.id);
      }
      const targetReportId = reportIdRef.current!;
      const args = { companyProfile: empresa, steep, horizon, language };

      // 2. Up-front research pass. ONE web_search-enabled call gathers
      //    concrete, dated facts about the sector + challenge; the
      //    result is then folded into each of the 5 section prompts so
      //    they all anchor on the same shared bullets. Mirrors the
      //    Global STEEP scan-then-reformulate pattern and cuts the
      //    total web_search budget by ~5×. If the scan fails the whole
      //    generation fails — the user retries.
      const scan = await analyzeScan(args, (p) => {
        // Both counters tick during the scan — sources climb while
        // web_search runs, chars climb while the model is writing out
        // the research bullets.
        setResearchSources((prev) => (prev === p.sources ? prev : p.sources));
        setResearchChars((prev) => (prev === p.chars ? prev : p.chars));
      })
        .then((r) => {
          setAnalysisProgress((p) => ({ ...p, research: 'done' }));
          return r;
        })
        .catch((err) => {
          setAnalysisProgress((p) => ({ ...p, research: 'error' }));
          console.error('[analyze:research] failed:', err);
          throw err;
        });

      // 3. ALL FIVE analysis calls fire in parallel with the shared
      //    research context. No web_search inside these — they use the
      //    bullets from step 2 verbatim. Promise.allSettled means a
      //    partial failure still produces a report with the sections
      //    that came back.
      const argsWithResearch = { ...args, research: scan.research };
      type SectionKey =
        | 'summary'
        | 'scenarios'
        | 'planning'
        | 'strategicMap'
        | 'backcasting';
      // Sections no longer use web_search, so chars-streamed is the
      // meaningful progress signal (sources stays 0 across the board).
      const onSectionProgress = (key: SectionKey) => (p: { chars: number }) => {
        setSectionChars((prev) =>
          prev[key] === p.chars ? prev : { ...prev, [key]: p.chars },
        );
      };
      setAnalysisProgress((p) => ({
        ...p,
        summary: 'running',
        scenarios: 'running',
        planning: 'running',
        strategicMap: 'running',
        backcasting: 'running',
      }));

      // Helper that wraps each section call with its progress-state
      // transitions AND logs the rejection reason. Promise.allSettled
      // swallows individual rejections silently otherwise — the loader
      // row turns red but the actual error message never surfaces.
      const onSectionDone = (key: SectionKey) => (r: unknown) => {
        setAnalysisProgress((p) => ({ ...p, [key]: 'done' }));
        return r;
      };
      const onSectionError = (key: SectionKey) => (err: unknown) => {
        setAnalysisProgress((p) => ({ ...p, [key]: 'error' }));
        console.error(`[analyze:${key}] failed:`, err);
        throw err;
      };

      const [summary, scenarios, planning, strategicMap, backcasting] =
        await Promise.allSettled([
          analyzeSummary(argsWithResearch, onSectionProgress('summary'))
            .then(onSectionDone('summary'), onSectionError('summary')),
          analyzeScenarios(argsWithResearch, onSectionProgress('scenarios'))
            .then(onSectionDone('scenarios'), onSectionError('scenarios')),
          analyzeScenarioPlanning(argsWithResearch, onSectionProgress('planning'))
            .then(onSectionDone('planning'), onSectionError('planning')),
          analyzeStrategicMap(argsWithResearch, onSectionProgress('strategicMap'))
            .then(onSectionDone('strategicMap'), onSectionError('strategicMap')),
          analyzeBackcasting(argsWithResearch, onSectionProgress('backcasting'))
            .then(onSectionDone('backcasting'), onSectionError('backcasting')),
        ]);

      // 4. Merge the successful sections into a single resultData blob.
      //    Anything that errored is silently skipped — the renderer's
      //    tabs handle a missing section with an empty-state.
      //
      //    Backcasting entries arrive with placeholder `scenarioName` values
      //    (the prompt has no access to the 3P names produced by the
      //    scenarios-call sibling). We patch them here so each entry shows
      //    the matching evocative scenario name — mirrors the merge step
      //    in the demo's analysis.js.
      //
      //    Sources are now sourced entirely from the up-front scan call
      //    (the 5 sections don't web_search anymore), so we store them
      //    as the consolidated `report` bucket and skip the per-section
      //    breakdown that used to be `bySection`.
      const fullResult: Record<string, unknown> = {};
      const scenarioList =
        scenarios.status === 'fulfilled' ? scenarios.value.result.scenarios ?? [] : [];
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
      if (planning.status === 'fulfilled') fullResult.scenarioPlanning = planning.value.result;
      if (strategicMap.status === 'fulfilled')
        fullResult.strategicMap = strategicMap.value.result;
      if (backcasting.status === 'fulfilled') {
        fullResult.backcasting = backcasting.value.result.map((bc) => ({
          ...bc,
          scenarioName: nameByType[bc.scenarioType] ?? bc.scenarioName,
        }));
      }

      // ── Sources from the up-front scan + Step 2 globalSteep scan ──
      // Two buckets are surfaced in the report's Sources tab:
      //   report      — citations from the analyze/scan call (this run)
      //   globalSteep — citations from the Step 2 globalSteepScan call,
      //                 captured in transient state when StepGlobal ran
      //                 (may be empty for reports loaded from a saved
      //                 draft where the user never re-ran step 2).
      // Each bucket is deduped independently — same URL surfacing in
      // both is rare and worth showing twice with its proper attribution.
      const hasAnyCitations = scan.citations.length > 0 || globalSteepCitations.length > 0;
      if (hasAnyCitations) {
        const dedup = (items: SourceItem[]) => {
          const seen = new Map<string, SourceItem>();
          for (const c of items) {
            if (!seen.has(c.url)) seen.set(c.url, c);
          }
          return Array.from(seen.values());
        };
        fullResult.sources = {
          report: dedup(scan.citations),
          globalSteep: dedup(globalSteepCitations),
        };
      }

      await updateReport.mutateAsync({
        id: targetReportId,
        body: { resultData: fullResult },
      });
      navigate(`/reports/${targetReportId}`);
      // Don't reset isGenerating on success — the unmount handles it.
    } catch (e) {
      setGenerateError(extractApiErrorMessage(e, t('report.results.errorDefault')));
      setIsGenerating(false);
    }
  }

  /* ─── Assistant integration ─────────────────────────────────────────
     Publishes the wizard state so the assistant can answer "what's in
     this report?" without the user having to paste it. Also registers
     the page-scoped commands (setField, runAnalysis, generateGlobalSteep)
     — they live here because their handlers close over the local state
     setters. */
  const setAssistantContext = useSetAssistantContext();
  useEffect(() => {
    setAssistantContext({
      currentStep: step,
      maxReached,
      empresa,
      globalSteep: globalData,
      steep,
      horizon,
      isGenerating,
    });
    return () => setAssistantContext(undefined);
  }, [setAssistantContext, step, maxReached, empresa, globalData, steep, horizon, isGenerating]);

  // Wizard-scoped commands. useCommands snapshots the previous registration
  // for each name on mount and restores it on unmount, so overriding `goTo`
  // here automatically re-installs the shell-level navigation-only version
  // when the user navigates away.
  useCommands(() => [
    {
      name: 'setField',
      mode: 'confirm',
      label: (args) => {
        const { id } = args as { id: string };
        return `Aplicar a ${id}`;
      },
      preview: (args) => {
        const { value } = args as { value: string };
        return value;
      },
      handler: (args) => {
        const { id, value, mode } = args as {
          id: string;
          value: string;
          mode: 'add' | 'replace';
        };
        const apply = (cur: string) =>
          mode === 'replace' ? value : cur ? `${cur}\n\n${value}` : value;
        switch (id) {
          case 'f-name':
            setEmpresa((p) => ({ ...p, name: value })); break;
          case 'f-sector':
            setEmpresa((p) => ({ ...p, sector: value })); break;
          case 'f-size':
            setEmpresa((p) => ({ ...p, size: value })); break;
          case 'f-horizon':
            setEmpresa((p) => ({ ...p, horizon: value })); break;
          case 'f-market':
            setEmpresa((p) => ({ ...p, market: value })); break;
          case 'f-challenge':
            setEmpresa((p) => ({ ...p, challenge: apply(p.challenge) })); break;
          case 'f-strengths':
            setEmpresa((p) => ({ ...p, strengths: apply(p.strengths) })); break;
          case 'f-consultant-name':
            setEmpresa((p) => ({ ...p, consultantName: value })); break;
          case 'f-consultant-company':
            setEmpresa((p) => ({ ...p, consultantCompany: value })); break;
          case 'gs-s':
            setGlobalData((p) => ({ ...p, S: apply(p.S) })); break;
          case 'gs-t':
            setGlobalData((p) => ({ ...p, T: apply(p.T) })); break;
          case 'gs-e':
            setGlobalData((p) => ({ ...p, E: apply(p.E) })); break;
          case 'gs-env':
            setGlobalData((p) => ({ ...p, ENV: apply(p.ENV) })); break;
          case 'gs-p':
            setGlobalData((p) => ({ ...p, P: apply(p.P) })); break;
          case 'steep-s':
            setSteep((p) => ({ ...p, social: apply(p.social) })); break;
          case 'steep-t':
            setSteep((p) => ({ ...p, technological: apply(p.technological) })); break;
          case 'steep-e':
            setSteep((p) => ({ ...p, economic: apply(p.economic) })); break;
          case 'steep-env':
            setSteep((p) => ({ ...p, environmental: apply(p.environmental) })); break;
          case 'steep-p':
            setSteep((p) => ({ ...p, political: apply(p.political) })); break;
          case 'hs-h1':
            setHorizon((p) => ({ ...p, H1: apply(p.H1) })); break;
          case 'hs-h2':
            setHorizon((p) => ({ ...p, H2: apply(p.H2) })); break;
          case 'hs-h3':
            setHorizon((p) => ({ ...p, H3: apply(p.H3) })); break;
          default:
            throw new Error(`Unknown field id: ${id}`);
        }
        // Brief gold flash on the field so the user can see WHERE the
        // value landed. Deferred to the next macrotask so React commits
        // the new value first; otherwise the flash starts before the
        // textarea/input visibly updates. The field's id matches the
        // setField target id by design — see the id attributes on each
        // wizard step's inputs.
        window.setTimeout(() => {
          const el = document.getElementById(id);
          if (!el) return;
          el.classList.add('fs-suggest-flash');
          window.setTimeout(() => el.classList.remove('fs-suggest-flash'), 1500);
        }, 0);
        return `Applied to ${id}.`;
      },
    },

    {
      name: 'runAnalysis',
      mode: 'confirm',
      label: () => 'Lanzar análisis de foresight',
      handler: async () => {
        await handleSubmit();
        return 'Analysis launched.';
      },
    },

    // generateGlobalSteep is registered from StepGlobal itself — that's the
    // only place that has access to the imperative fetchAll() and to the
    // fetchedFor ref needed to force a re-run when `sector` hasn't changed.

    // Override the shell's goTo while the wizard is mounted. The shell's
    // version uses navigate('/reports/new?step=N'), which is fine when the
    // user is on a different route, but does NOT re-render NewReportPage
    // when it's already mounted (initialStep is read once on mount and the
    // local `step` state never resyncs with the query string). Calling
    // goToStep directly is the only way to actually change the visible step.
    {
      name: 'goTo',
      mode: 'auto',
      handler: (args) => {
        const { step: target } = args as { step: number };
        if (target === 5) {
          throw new Error(
            "Step 5 is the analysis loader, not a navigable step. To start the analysis emit runAnalysis instead.",
          );
        }
        if (target === 6) {
          // Step 6 lives outside the wizard. If the report is already saved
          // and analysed, jump to its viewer; otherwise the request is a
          // no-op (the user has to generate first).
          const id = reportIdRef.current;
          if (id) {
            navigate(`/reports/${id}`);
            return `Opened the generated report.`;
          }
          throw new Error(
            'No analysed report yet. The user has to run the analysis (step 4 → Generate) before the results page exists.',
          );
        }
        if (target >= 1 && target <= 4) {
          goToStep(target);
          return `Moved to step ${target}.`;
        }
        throw new Error(`Step ${target} is out of range (1-6).`);
      },
    },

    // Convenience wrappers around goTo: bump or rewind by one wizard page.
    // Clamp to [1, 4] so the assistant can't fall off either end and so
    // step 5 (the loader) stays unreachable through nav.
    {
      name: 'wizardNext',
      mode: 'auto',
      handler: () => {
        if (step >= 4) {
          throw new Error(
            'Already at the last input step. To start the analysis emit runAnalysis.',
          );
        }
        goToStep(step + 1);
        return `Moved to step ${step + 1}.`;
      },
    },

    {
      name: 'wizardBack',
      mode: 'auto',
      handler: () => {
        if (step <= 1) {
          throw new Error('Already at the first wizard step.');
        }
        goToStep(step - 1);
        return `Moved to step ${step - 1}.`;
      },
    },

  ]);

  return (
    <div className="wizard">
      <main className="main">
        {isExampleMode && !isGenerating && (
          <div className="wizard-example-banner" role="note">
            <strong>{t('wizard.exampleMode.title', { defaultValue: 'Viewing example' })}</strong>
            <span>
              {t('wizard.exampleMode.desc', {
                defaultValue:
                  'You can explore the inputs and navigate between steps. Changes are not saved to the example.',
              })}
            </span>
          </div>
        )}
        {!isGenerating && (
          <>
            {step === 1 && (
              <StepEmpresa
                data={empresa}
                onChange={setEmpresa}
                hasGlobalSteep={(['S', 'T', 'E', 'ENV', 'P'] as const).some(
                  (k) => globalData[k].trim().length > 0,
                )}
                disableGenerate={isExampleMode}
                onContinue={() => {
                  // Continue without regenerating. Pre-claim the auto-
                  // fetch ref so step 2 doesn't surprise-trigger a scan
                  // if the user happens to be jumping into empty fields
                  // — picking Continue is an explicit "I'll handle this
                  // manually" gesture.
                  const sector = empresa.sector.trim();
                  if (sector) globalSteepFetchedForRef.current = sector;
                  goToStep(2);
                }}
                onGenerate={() => {
                  // Wipe both the displayed values and the auto-fetch
                  // claim so step 2's effect re-fires on entry. The
                  // step-2 loader will run the scan again with the
                  // current sector.
                  setGlobalData(EMPTY_GLOBAL_STEEP);
                  globalSteepFetchedForRef.current = null;
                  setGlobalSteepCitations([]);
                  goToStep(2);
                }}
              />
            )}
            {step === 2 && (
              <StepGlobal
                data={globalData}
                sector={empresa.sector}
                language={language}
                onChange={setGlobalData}
                onCitations={setGlobalSteepCitations}
                fetchedForRef={globalSteepFetchedForRef}
                onNext={() => goToStep(3)}
                onBack={() => goToStep(1)}
                disableGenerate={isExampleMode}
              />
            )}
            {step === 3 && (
              <StepSteep
                data={steep}
                companyProfile={companyProfile}
                language={language}
                onChange={setSteep}
                onNext={() => goToStep(4)}
                onBack={() => goToStep(2)}
              />
            )}
            {step === 4 && (
              <StepHorizon
                data={horizon}
                companyProfile={companyProfile}
                language={language}
                onChange={setHorizon}
                onSubmit={handleSubmit}
                onBack={() => goToStep(3)}
                isSubmitting={isGenerating}
                error={generateError}
                // Only edit-mode reports can have a pre-existing analysis;
                // a fresh wizard run starts with empty resultData. Drive
                // the SplitButton's primary action off whether the loaded
                // report carries any of the section payloads. Examples
                // always have resultData (the promote flow refuses
                // un-analysed reports), so this also flips the primary
                // action to Continue for them.
                hasReport={
                  editMode &&
                  !!editingReport.data?.resultData &&
                  Object.keys(
                    (editingReport.data.resultData as Record<string, unknown>) ?? {},
                  ).length > 0
                }
                disableGenerate={isExampleMode}
                onContinueToReport={() => {
                  // Examples don't have a separate id from the URL — the
                  // editingId IS the example id (the /reports/:id viewer
                  // resolves it via the example fallback). Real reports
                  // use the persisted reportIdRef.
                  const id = isExampleMode ? editingId : reportIdRef.current;
                  if (id) navigate(`/reports/${id}`);
                }}
              />
            )}
          </>
        )}
      </main>

      <OnboardingDialog
        open={showOnboarding}
        onClose={handleOnboardingClose}
      />

      {/* Analysis loader — full-screen Modal overlay so nothing else on
          the page (topbar, stepper, footer, chat) is interactive while
          the 5 parallel calls are in flight. The Modal portals to body
          and locks scroll via the shared refcount in Modal.tsx. */}
      <Modal
        open={isGenerating}
        onClose={() => undefined}
        variant="fullscreen"
        ariaLabel={t('report.results.analyzing')}
      >
        <LoadingPanel
          title={t('report.results.analyzing')}
          running={isGenerating}
          items={[
            {
              key: 'research',
              label: t('report.results.progressItems.research'),
              status: analysisProgress.research,
              metric: { sources: researchSources, chars: researchChars },
            },
            {
              key: 'summary',
              label: t('report.results.progressItems.summary'),
              status: analysisProgress.summary,
              metric: { chars: sectionChars.summary },
            },
            {
              key: 'scenarios',
              label: t('report.results.progressItems.scenarios'),
              status: analysisProgress.scenarios,
              metric: { chars: sectionChars.scenarios },
            },
            {
              key: 'planning',
              label: t('report.results.progressItems.scenarioPlanning'),
              status: analysisProgress.planning,
              metric: { chars: sectionChars.planning },
            },
            {
              key: 'strategicMap',
              label: t('report.results.progressItems.strategicMap'),
              status: analysisProgress.strategicMap,
              metric: { chars: sectionChars.strategicMap },
            },
            {
              key: 'backcasting',
              label: t('report.results.progressItems.backcasting'),
              status: analysisProgress.backcasting,
              metric: { chars: sectionChars.backcasting },
            },
          ] satisfies ProgressItem[]}
        />
      </Modal>
    </div>
  );
}
