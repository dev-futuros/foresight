import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCreateReport, useReport, useUpdateReport } from '../../hooks/useReports';
import { useCurrentUser } from '../../hooks/useAuth';
import { useSetStepper } from '../shell/StepperContext';
import {
  analyze,
  analyzeBackcasting,
  analyzeScenarioPlanning,
  analyzeSources,
  analyzeStrategicMap,
} from '../../lib/aiClient';
import { extractApiErrorMessage } from '../../lib/apiError';
import OnboardingDialog from '../../components/OnboardingDialog';
import LoadingPanel, {
  type ProgressItem,
  type ProgressItemStatus,
} from '../../components/LoadingPanel';
import { register, unregister } from '../../lib/commandBus';
import { useSetAssistantContext } from '../chat/AssistantContextProvider';
import { buildShellGoToCommand } from '../chat/AssistantCommands';
import '../../components/modal.css';
import StepEmpresa, { type EmpresaData } from './steps/StepEmpresa';
import StepGlobal, { type GlobalSteepData } from './steps/StepGlobal';
import StepSteep, { type SteepData } from './steps/StepSteep';
import StepHorizon, { type HorizonData } from './steps/StepHorizon';
import './wizard.css';

/** localStorage key — once set to '1', the onboarding modal won't auto-show
 *  again on this device. */
const ONBOARDING_KEY = 'fs_onboarding_dismissed';

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
  // Per-section status for the analysis loader checklist. The single
  // /api/ai/analyze call covers all five — once F3 splits the backend into
  // per-section calls, each will toggle its own item independently.
  const [analysisProgress, setAnalysisProgress] = useState<
    Record<'scenarios' | 'planning' | 'backcasting' | 'strategicMap' | 'sources', ProgressItemStatus>
  >({
    scenarios: 'pending',
    planning: 'pending',
    backcasting: 'pending',
    strategicMap: 'pending',
    sources: 'pending',
  });
  // Highest step the user has ever reached. Lets the stepper allow forward
  // jumps to already-visited steps in addition to back-nav. In edit mode
  // every step is already "reached" since the report was previously fully
  // submitted, so default to 4 (the last input step).
  const [maxReached, setMaxReached] = useState(editMode ? 4 : initialStep);
  // First-run welcome dialog. Lazy-init from localStorage so we don't flash
  // the dialog open on remount when the user has already dismissed it.
  // Skip in edit mode — the user has clearly used the wizard before.
  const [showOnboarding, setShowOnboarding] = useState(
    () => !editMode && !readOnboardingDismissed(),
  );

  const handleOnboardingClose = useCallback((dontShowAgain: boolean) => {
    if (dontShowAgain) persistOnboardingDismissed();
    setShowOnboarding(false);
  }, []);

  const handleLoadExample = useCallback(async (dontShowAgain: boolean) => {
    if (dontShowAgain) persistOnboardingDismissed();
    try {
      const res = await fetch('/example-report.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        companyProfile?: EmpresaData;
        globalSteep?: GlobalSteepData;
        steep?: SteepData;
        horizon?: HorizonData;
      };
      if (data.companyProfile) setEmpresa({ ...EMPTY_EMPRESA, ...data.companyProfile });
      if (data.globalSteep) setGlobalData({ ...EMPTY_GLOBAL_STEEP, ...data.globalSteep });
      if (data.steep) setSteep({ ...EMPTY_STEEP, ...data.steep });
      if (data.horizon) setHorizon({ ...EMPTY_HORIZON, ...data.horizon });
      // Land on step 1 so the user can see the seeded company profile first.
      setStep(1);
      setMaxReached(1);
    } catch (e) {
      // Non-blocking: keep dialog dismissed and let user fill the form by hand.
      // eslint-disable-next-line no-console
      console.error('[onboarding] failed to load example-report.json', e);
    } finally {
      setShowOnboarding(false);
    }
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

  /** Persists a draft snapshot. POST on first call (no id yet), PATCH after.
   *  Fire-and-forget: errors are logged but never block UX — the user can
   *  keep editing and the next step transition will retry. */
  const persistDraft = useCallback(
    async (currentStep: number): Promise<void> => {
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
      horizon?: Partial<HorizonData>;
      currentStep?: number;
    };
    if (inputs.companyProfile) setEmpresa({ ...EMPTY_EMPRESA, ...inputs.companyProfile });
    if (inputs.globalSteep) setGlobalData({ ...EMPTY_GLOBAL_STEEP, ...inputs.globalSteep });
    if (inputs.steep) setSteep({ ...EMPTY_STEEP, ...inputs.steep });
    if (inputs.horizon) setHorizon({ ...EMPTY_HORIZON, ...inputs.horizon });
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

  // Step bar mirrors the demo verbatim: 6 items including the post-submit "Análisis"
  // and "Resultados" tabs. The wizard itself only navigates through 1-4. Step 5
  // (the analysis loading screen) is never a real page → clickable:false. Step 6
  // routes to the generated report — only meaningful in edit mode.
  const steps = useMemo(
    () => [
      { n: 1, label: t('wizard.steps.empresa') },
      { n: 2, label: t('wizard.steps.global') },
      { n: 3, label: t('wizard.steps.steep') },
      { n: 4, label: t('wizard.steps.horizon') },
      { n: 5, label: t('wizard.steps.analysis'), clickable: false },
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
    setGenerateError(null);
    setIsGenerating(true);
    setAnalysisProgress({
      scenarios: 'running',
      planning: 'pending',
      backcasting: 'pending',
      strategicMap: 'pending',
      sources: 'pending',
    });
    try {
      // 1. Make sure the latest inputs are persisted before we kick off the
      //    expensive analysis. In the common path the draft has already been
      //    saved on every step transition, so this is essentially a no-op
      //    PATCH that also creates the row on the unlikely path where the
      //    user typed nothing in steps 1-3 and only filled step 4.
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
      // 2. Base analysis — produces the 3P scenarios that anchor every
      //    downstream call. Failing here is fatal: without scenarios there's
      //    nothing for scenario-planning / backcasting / strategic-map to
      //    hang off of.
      const base = await analyze({
        companyProfile: empresa,
        steep,
        horizon,
        language,
      });
      setAnalysisProgress((p) => ({
        ...p,
        scenarios: 'done',
        planning: 'running',
        backcasting: 'running',
        strategicMap: 'running',
        sources: 'running',
      }));
      // Save the base result immediately so even if a downstream call fails
      // the user lands on a non-empty report.
      await updateReport.mutateAsync({
        id: targetReportId,
        body: { resultData: base as unknown as Record<string, unknown> },
      });
      // 3. Four downstream calls in parallel. Each marks its own item done
      //    on resolve so the loading checklist updates in real time. We use
      //    allSettled so a partial failure (e.g. sources timing out) doesn't
      //    drop the rest — the report still gets the sections that came back.
      const ctx = {
        companyProfile: empresa,
        steep,
        horizon,
        language,
        scenarios: base.scenarios ?? [],
      };
      const [planning, backcasting, strategicMap, sources] = await Promise.allSettled([
        analyzeScenarioPlanning(ctx).then((r) => {
          setAnalysisProgress((p) => ({ ...p, planning: 'done' }));
          return r;
        }),
        analyzeBackcasting(ctx).then((r) => {
          setAnalysisProgress((p) => ({ ...p, backcasting: 'done' }));
          return r;
        }),
        analyzeStrategicMap(ctx).then((r) => {
          setAnalysisProgress((p) => ({ ...p, strategicMap: 'done' }));
          return r;
        }),
        analyzeSources({ companyProfile: empresa, steep, horizon, language }).then((r) => {
          setAnalysisProgress((p) => ({ ...p, sources: 'done' }));
          return r;
        }),
      ]);
      // 4. Final patch with whatever sections succeeded. Failed ones stay
      //    undefined and the renderer skips them.
      const fullResult: Record<string, unknown> = { ...base };
      if (planning.status === 'fulfilled') fullResult.scenarioPlanning = planning.value;
      if (backcasting.status === 'fulfilled') fullResult.backcasting = backcasting.value;
      if (strategicMap.status === 'fulfilled') fullResult.strategicMap = strategicMap.value;
      if (sources.status === 'fulfilled') fullResult.sources = sources.value;
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
     the page-scoped commands (setField, runAnalysis, generateGlobalSteep,
     loadExample) — they live here because their handlers close over the
     local state setters. */
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

  // Refs shadow handleSubmit / handleLoadExample / goToStep / navigate so the
  // registered commands always call the freshest closure without forcing the
  // command-bus useEffect to re-run on every change. The whole point of the
  // bus registration is to happen ONCE per mount; deps that change between
  // renders cause cleanup → re-register cycles, and a dispatched goTo that
  // lands during the brief window after cleanup ran the shell-version
  // restore would silently fall through to navigate(?step=N) — which can't
  // change the visible step while the wizard is already mounted.
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;
  const handleLoadExampleRef = useRef(handleLoadExample);
  handleLoadExampleRef.current = handleLoadExample;
  const goToStepRef = useRef(goToStep);
  goToStepRef.current = goToStep;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    register<{ id: string; value: string; mode: 'add' | 'replace' }, string>({
      name: 'setField',
      mode: 'confirm',
      label: ({ id }) => `Aplicar a ${id}`,
      preview: ({ value }) => value,
      handler: ({ id, value, mode }) => {
        const apply = (cur: string) =>
          mode === 'replace' ? value : cur ? `${cur}\n\n${value}` : value;
        switch (id) {
          case 'f-name':
            setEmpresa((p) => ({ ...p, name: mode === 'replace' ? value : value })); break;
          case 'f-sector':
            setEmpresa((p) => ({ ...p, sector: mode === 'replace' ? value : value })); break;
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
        return `Applied to ${id}.`;
      },
    });

    register<Record<string, never>, string>({
      name: 'runAnalysis',
      mode: 'confirm',
      label: () => 'Lanzar análisis de foresight',
      handler: async () => {
        await handleSubmitRef.current();
        return 'Analysis launched.';
      },
    });

    // generateGlobalSteep is registered from StepGlobal itself — that's the
    // only place that has access to the imperative fetchAll() and to the
    // fetchedFor ref needed to force a re-run when `sector` hasn't changed.

    // Override the shell's goTo while the wizard is mounted. The shell's
    // version uses navigate('/reports/new?step=N'), which is fine when the
    // user is on a different route, but does NOT re-render NewReportPage
    // when it's already mounted (initialStep is read once on mount and the
    // local `step` state never resyncs with the query string). Calling
    // goToStep directly is the only way to actually change the visible step.
    register<{ step: number }, string>({
      name: 'goTo',
      mode: 'auto',
      handler: ({ step }) => {
        if (step === 5) {
          throw new Error(
            "Step 5 is the analysis loader, not a navigable step. To start the analysis emit runAnalysis instead.",
          );
        }
        if (step === 6) {
          // Step 6 lives outside the wizard. If the report is already saved
          // and analysed, jump to its viewer; otherwise the request is a
          // no-op (the user has to generate first).
          if (reportIdRef.current) {
            navigateRef.current(`/reports/${reportIdRef.current}`);
            return `Opened the generated report.`;
          }
          throw new Error(
            'No analysed report yet. The user has to run the analysis (step 4 → Generate) before the results page exists.',
          );
        }
        if (step >= 1 && step <= 4) {
          goToStepRef.current(step);
          return `Moved to step ${step}.`;
        }
        throw new Error(`Step ${step} is out of range (1-6).`);
      },
    });

    register<Record<string, never>, string>({
      name: 'loadExample',
      mode: 'auto',
      handler: () => {
        void handleLoadExampleRef.current(true);
        return 'Loaded the Restalia example.';
      },
    });

    return () => {
      ['setField', 'runAnalysis', 'loadExample'].forEach(unregister);
      // Don't just unregister 'goTo' — that would leave the assistant
      // without a working command on the dashboard / account pages until
      // they re-mount the shell. Restore the navigation-only shell version.
      register(buildShellGoToCommand(navigateRef.current));
    };
    // Empty deps on purpose: the bus must be wired once per mount. Handlers
    // close over refs that are kept current by the assignments above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="wizard">
      <main className="main">
        {isGenerating ? (
          <LoadingPanel
            title={t('report.results.analyzing')}
            running={isGenerating}
            items={[
              {
                key: 'scenarios',
                label: t('report.results.progressItems.scenarios'),
                status: analysisProgress.scenarios,
              },
              {
                key: 'planning',
                label: t('report.results.progressItems.scenarioPlanning'),
                status: analysisProgress.planning,
              },
              {
                key: 'backcasting',
                label: t('report.results.progressItems.backcasting'),
                status: analysisProgress.backcasting,
              },
              {
                key: 'strategicMap',
                label: t('report.results.progressItems.strategicMap'),
                status: analysisProgress.strategicMap,
              },
              {
                key: 'sources',
                label: t('report.results.progressItems.sources'),
                status: analysisProgress.sources,
              },
            ] satisfies ProgressItem[]}
          />
        ) : (
          <>
            {step === 1 && (
              <StepEmpresa data={empresa} onChange={setEmpresa} onNext={() => goToStep(2)} />
            )}
            {step === 2 && (
              <StepGlobal
                data={globalData}
                sector={empresa.sector}
                language={language}
                onChange={setGlobalData}
                onNext={() => goToStep(3)}
                onBack={() => goToStep(1)}
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
              />
            )}
          </>
        )}
      </main>

      <OnboardingDialog
        open={showOnboarding}
        onClose={handleOnboardingClose}
        onLoadExample={handleLoadExample}
      />
    </div>
  );
}
