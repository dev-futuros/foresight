import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCreateReport, useReport, useUpdateReport } from '../../hooks/useReports';
import Modal from '../../components/Modal';
import { useCurrentUser } from '../../hooks/useAuth';
import { useSetStepper } from '../shell/useStepper';
import {
  analyzeBackcasting,
  analyzeScenarioPlanning,
  analyzeScenarios,
  analyzeStrategicMap,
  analyzeSummary,
  type SourceItem,
} from '../../lib/aiClient';
import { extractApiErrorMessage } from '../../lib/apiError';
import { notifyAssistant, resetAssistant } from '../../lib/assistantBridge';
import OnboardingDialog from '../../components/OnboardingDialog';
import LoadingPanel, {
  type ProgressItem,
  type ProgressItemStatus,
} from '../../components/LoadingPanel';
import { useCommands } from '../../lib/useCommands';
import { useSetAssistantContext } from '../chat/useAssistantContext';
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
  // Per-row status for the analysis loader checklist. Matches the
  // demo's pattern: 5 parallel section rows, each running its own
  // Opus + web_search call. The earlier "research" row that ran a
  // single upstream scan was removed because it serialised the
  // critical path and doubled the wall-clock generation time.
  const [analysisProgress, setAnalysisProgress] = useState<
    Record<
      'summary' | 'scenarios' | 'planning' | 'strategicMap' | 'backcasting',
      ProgressItemStatus
    >
  >({
    summary: 'pending',
    scenarios: 'pending',
    planning: 'pending',
    strategicMap: 'pending',
    backcasting: 'pending',
  });
  // Live char + source counts for each of the 5 section rows. Each
  // section now does its own web_search (matching the demo), so we
  // want both signals in the loader: chars tick as the model writes
  // its JSON, sources tick as web_search harvests URLs. Updated from
  // each analyzeX onProgress callback.
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
  const [sectionSources, setSectionSources] = useState<
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

  // Mirror of the user's effective language into a ref so persistDraft
  // (declared a few lines below and built with `useCallback`) can read
  // the freshest value without re-creating on every language change.
  // We need this on report CREATION specifically — the language that's
  // active when the user first commits a draft becomes the report's
  // permanent `primaryLanguage`, which downstream UI (dashboard chips,
  // translation buttons) labels as "the authored language". The value
  // is computed lower in the component and written into the ref on
  // every render via the assignment after the `language` const.
  const languageRef = useRef<'es' | 'en'>('es');

  // Example mode — the user is exploring a global example through the
  // wizard. Inputs render exactly like a real report's, but every
  // would-be persistence path is short-circuited: no autosave, no
  // create-as-draft, no generate-analysis. The user can freely click
  // around the steps and edit fields; nothing leaves the page.
  const isExampleMode = editingReport.data?.source === 'example';
  const isExampleModeRef = useRef(isExampleMode);
  useEffect(() => {
    isExampleModeRef.current = isExampleMode;
  });

  // ── Autosave state machine ──────────────────────────────────────
  // The wizard PATCHes the draft on a debounced timer as the user
  // types. Three knobs:
  //
  //   - AUTOSAVE_DEBOUNCE_MS — how long after the last keystroke we
  //     fire the save. Long enough to coalesce a paragraph of typing
  //     into one PATCH, short enough that "Saved" lands within a
  //     reasonable expectation of "I just stopped typing".
  //   - In-flight guard — if a save is already running when a new one
  //     wants to fire, we postpone the second one until the first
  //     resolves. Prevents an older PATCH from racing-and-overwriting
  //     a newer one (no operational transform, just last-write-wins
  //     ordering).
  //   - prefillCompleteRef — initial prefill assigns React state
  //     which would otherwise look like "user just edited", triggering
  //     an immediate no-op autosave. The ref flips true once after
  //     the first prefill effect finishes, so user-driven changes
  //     thereafter are the only ones the debouncer sees.
  const AUTOSAVE_DEBOUNCE_MS = 1500;
  type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const inflightSaveRef = useRef<boolean>(false);
  const prefillCompleteRef = useRef<boolean>(!editMode);
  // Cache the status in a ref so flushAutosave / unmount cleanup can
  // read it without becoming a render-time dependency.
  const saveStatusRef = useRef<SaveStatus>(saveStatus);
  useEffect(() => {
    saveStatusRef.current = saveStatus;
  });

  /** Persists a draft snapshot. POST on first call (no id yet), PATCH after.
   *  Drives the autosave status indicator — sets 'saving' before the call,
   *  'saved' / 'error' after. Examples short-circuit (their content lives
   *  in the {@code examples} table, not {@code reports}, so a PATCH against
   *  {@code /api/reports/:id} would 404). */
  const persistDraft = useCallback(
    async (currentStep: number): Promise<void> => {
      if (isExampleModeRef.current) return;
      if (!hasMeaningfulContent()) return;
      // Coalesce overlapping saves. If a save is already in flight, mark
      // the document still-dirty and let the debounced scheduler pick it
      // up after the current save resolves. Stops the older save from
      // arriving at the server AFTER a newer one.
      if (inflightSaveRef.current) {
        setSaveStatus('dirty');
        return;
      }
      inflightSaveRef.current = true;
      setSaveStatus('saving');
      const title = buildTitle();
      const inputData = buildInputData(currentStep);
      try {
        if (reportIdRef.current) {
          await updateReportAsync({
            id: reportIdRef.current,
            body: { title, inputData },
          });
        } else {
          // Stamp the report's primaryLanguage at creation time with the
          // user's effective language. Dashboard chips read this back
          // to label the "authored language" — without it, every
          // report defaults to ES regardless of UI locale.
          const created = await createReportAsync({
            title,
            inputData,
            primaryLanguage: languageRef.current,
          });
          reportIdRef.current = created.id;
          setReportId(created.id);
        }
        setSaveStatus('saved');
        setLastSavedAt(new Date());
      } catch (err) {
         
        console.error('[autosave] persistDraft failed', err);
        setSaveStatus('error');
      } finally {
        inflightSaveRef.current = false;
      }
    },
    [buildInputData, buildTitle, createReportAsync, updateReportAsync],
  );

  /** Cancel any pending debounce + fire the save immediately. Used on
   *  step transitions (so Continue still commits in-flight edits) and
   *  on unmount (so navigating away doesn't drop a pending PATCH). */
  const flushAutosave = useCallback(async (): Promise<void> => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (saveStatusRef.current === 'dirty') {
      await persistDraftRef.current(stepRef.current);
    }
  }, []);

  // Mirror persistDraft into a ref so goToStep can stay stable (deps: []).
  // Without this every render of NewReportPage would yield a new goToStep,
  // a new handleStepperSelect, a new stepperState, and useSetStepper would
  // cycle the slot in StepperContext on every render.
  const persistDraftRef = useRef(persistDraft);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- persistDraftRef IS a ref despite the rule's misfire; the assignment runs after commit so flushAutosave's later closure read sees the latest persistDraft
    persistDraftRef.current = persistDraft;
  });

  // Mirror the active step into a ref so flushAutosave can read it
  // without taking `step` as a dep (which would re-create flushAutosave
  // — and every dependent — on every step change).
  const stepRef = useRef<number>(initialStep);
  // True once goToStep has been called since mount. Used by the
  // prefill effect to detect "the user (or assistant) already chose
  // a step explicitly" — without this flag, a late-arriving
  // editingReport.data would clobber an explicit goTo(2) with the
  // saved currentStep (e.g. 3), making the chat-driven navigation
  // appear to skip steps.
  const userHasNavigatedRef = useRef<boolean>(false);

  const goToStep = useCallback((n: number) => {
    userHasNavigatedRef.current = true;
    setStep(n);
    // eslint-disable-next-line react-hooks/immutability -- stepRef IS a ref (despite the rule's misfire); keeping current advanced before flushAutosave reads it
    stepRef.current = n;
    setMaxReached((prev) => Math.max(prev, n));
    // Flush any pending autosave so the user's last keystrokes land
    // under the OLD step before we record the move. The persistDraft
    // inside flush reads stepRef.current — which we've already
    // advanced — so the saved currentStep reflects where the user
    // ended up, while the inputData includes everything they typed
    // before clicking Continue.
    void flushAutosave();
  }, [flushAutosave]);

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

  // Mirror the four slices + language + reportId into refs every render.
  // persistDraft reads from these so it always sees the freshest values
  // without being rebuilt on every keystroke (which would cascade through
  // useCallback dependents).
  useEffect(() => {
    languageRef.current = language;
    empresaRef.current = empresa;
    globalDataRef.current = globalData;
    steepRef.current = steep;
    horizonRef.current = horizon;
    reportIdRef.current = reportId;
  });

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot prefill from the API response; guarded by the prefilledFor ref above so it runs at most once per report id
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
    // Resume on the step the user left off on, unless:
    //   - the URL carries an explicit ?step=N (initialStep already
    //     captured it; honour the URL over the auto-saved value); OR
    //   - the user (or the assistant) has already called goToStep
    //     since the page mounted, which means they explicitly chose
    //     a step before this prefill landed. Without this guard, a
    //     late-arriving editingReport.data would clobber an explicit
    //     goTo(2) with the saved currentStep (e.g. 3), making the
    //     chat-driven navigation appear to skip a step.
    const fromUrl = searchParams.get('step');
    if (
        !fromUrl &&
        !userHasNavigatedRef.current &&
        typeof inputs.currentStep === 'number'
    ) {
      const resumeAt = Math.min(Math.max(inputs.currentStep, 1), 4);
      setStep(resumeAt);
      // eslint-disable-next-line react-hooks/immutability -- stepRef IS a ref; keeping current in sync with the resumed step so the next autosave records the right step
      stepRef.current = resumeAt;
      setMaxReached((prev) => Math.max(prev, resumeAt));
    }
    // The prefill has just assigned React state; the keystroke-driven
    // autosave effect below shouldn't treat that as a user edit. Flip
    // the gate so subsequent user-driven state changes ARE detected.
    prefillCompleteRef.current = true;
  }, [editMode, editingReport.data, searchParams]);

  // ── Keystroke-debounced autosave ────────────────────────────────
  // Watches the four user-editable wizard slices. On any change we
  // mark the document dirty, cancel any pending save, and schedule a
  // new save after AUTOSAVE_DEBOUNCE_MS of inactivity. Coalesces a
  // paragraph of fast typing into one PATCH; commits within ~1.5s
  // after the user pauses.
  //
  // Skipped entirely in example mode (read-only content) and during
  // the initial prefill (which assigns state programmatically). Also
  // skipped while the analysis pipeline is running so the in-flight
  // generation can't race with a draft PATCH.
  useEffect(() => {
    if (!prefillCompleteRef.current) return;
    if (isExampleModeRef.current) return;
    if (isGenerating) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this IS the autosave state machine: any user-driven change to the wizard slices must flip status to 'dirty' and reschedule the debounced save
    setSaveStatus('dirty');
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void persistDraftRef.current(stepRef.current);
    }, AUTOSAVE_DEBOUNCE_MS);
    // No cleanup here — the timer is shared across re-renders and only
    // gets cancelled by (a) the next change resetting it, (b) goToStep
    // calling flushAutosave, or (c) the unmount effect below.
  }, [empresa, globalData, steep, horizon, isGenerating]);

  // Flush any pending debounce on unmount so a half-typed paragraph
  // doesn't drop when the user navigates away. Also cancels the timer
  // so an unmounted-component setState warning doesn't fire from a
  // late callback.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // Fire one last save synchronously-ish — we await nothing, but
      // the fetch is queued before the React tree finishes tearing
      // down. fetch() requests survive unmount.
      if (saveStatusRef.current === 'dirty' && !isExampleModeRef.current) {
        void persistDraftRef.current(stepRef.current);
      }
    };
  }, []);

  // beforeunload guard — if the user closes the tab with a dirty
  // document, the browser prompts the standard "leave / stay" dialog.
  // We can't reliably issue an authenticated POST from inside
  // beforeunload (sendBeacon doesn't carry custom Authorization
  // headers), so the safest UX is to make sure the user notices. In
  // practice the debounce window is short enough that this almost
  // never fires.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (saveStatusRef.current === 'dirty' || saveStatusRef.current === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Tick the "Saved Ns ago" caption every 15s so the relative time
  // visibly stays current. Stored as the actual timestamp so the label
  // useMemo can derive the elapsed delta without calling Date.now()
  // during render (which the React Compiler treats as impure).
  const [nowMs, setNowMs] = useState<number>(0);
  useEffect(() => {
    if (saveStatus !== 'saved') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap the timestamp so the first render after 'saved' shows "just saved" instead of "Nh ago" against the default 0
    setNowMs(Date.now());
    const t = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, [saveStatus]);

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
    // Drop any pending autosave timer before we start so a debounced
    // PATCH doesn't race with handleSubmit's explicit persistDraft +
    // subsequent resultData update. The handleSubmit flow does its
    // own saves at the right moments.
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setGenerateError(null);
    setIsGenerating(true);
    // Reset loader state — all 5 sections start running immediately in
    // parallel (each does its own web_search now, matching the demo).
    setAnalysisProgress({
      summary: 'running',
      scenarios: 'running',
      planning: 'running',
      strategicMap: 'running',
      backcasting: 'running',
    });
    setSectionChars({
      summary: 0,
      scenarios: 0,
      planning: 0,
      strategicMap: 0,
      backcasting: 0,
    });
    setSectionSources({
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
          // Same primaryLanguage stamping as the autosave create — see
          // the persistDraft branch above for the rationale.
          primaryLanguage: language,
        });
        reportIdRef.current = created.id;
        setReportId(created.id);
      }
      const targetReportId = reportIdRef.current!;
      const args = { companyProfile: empresa, steep, horizon, language };

      // ALL FIVE analysis calls fire in parallel — each does its OWN
      // web_search via the backend (Opus + web_search, matching the
      // demo). Removed the earlier upstream "research" scan because it
      // serialised the critical path and doubled the wall-clock
      // generation time. Promise.allSettled means a partial failure
      // still produces a report with the sections that came back.
      type SectionKey =
        | 'summary'
        | 'scenarios'
        | 'planning'
        | 'strategicMap'
        | 'backcasting';
      const onSectionProgress =
        (key: SectionKey) => (p: { chars: number; sources: number }) => {
          setSectionChars((prev) =>
            prev[key] === p.chars ? prev : { ...prev, [key]: p.chars },
          );
          setSectionSources((prev) =>
            prev[key] === p.sources ? prev : { ...prev, [key]: p.sources },
          );
        };

      // Helper that wraps each section call with its progress-state
      // transitions AND logs the rejection reason. Promise.allSettled
      // swallows individual rejections silently otherwise — the loader
      // row turns red but the actual error message never surfaces.
      // Generic so the result type flows through `.then` unchanged —
      // otherwise Promise.allSettled's `value` collapses to `unknown`
      // and every downstream `summary.value.result` access becomes a
      // type error.
      const onSectionDone = <T,>(key: SectionKey) => (r: T): T => {
        setAnalysisProgress((p) => ({ ...p, [key]: 'done' }));
        return r;
      };
      const onSectionError = (key: SectionKey) => (err: unknown): never => {
        setAnalysisProgress((p) => ({ ...p, [key]: 'error' }));
        console.error(`[analyze:${key}] failed:`, err);
        throw err;
      };

      const [summary, scenarios, planning, strategicMap, backcasting] =
        await Promise.allSettled([
          analyzeSummary(args, onSectionProgress('summary'))
            .then(onSectionDone('summary'), onSectionError('summary')),
          analyzeScenarios(args, onSectionProgress('scenarios'))
            .then(onSectionDone('scenarios'), onSectionError('scenarios')),
          analyzeScenarioPlanning(args, onSectionProgress('planning'))
            .then(onSectionDone('planning'), onSectionError('planning')),
          analyzeStrategicMap(args, onSectionProgress('strategicMap'))
            .then(onSectionDone('strategicMap'), onSectionError('strategicMap')),
          analyzeBackcasting(args, onSectionProgress('backcasting'))
            .then(onSectionDone('backcasting'), onSectionError('backcasting')),
        ]);

      // Merge the successful sections into a single resultData blob.
      // Anything that errored is silently skipped — the renderer's tabs
      // handle a missing section with an empty-state.
      //
      // Backcasting entries arrive with placeholder `scenarioName` values
      // (the prompt has no access to the 3P names produced by the
      // scenarios-call sibling). We patch them here so each entry shows
      // the matching evocative scenario name — mirrors the merge step in
      // the demo's analysis.js.
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

      // ── Sources aggregated from each section's web_search citations ──
      // Two buckets are surfaced in the report's Sources tab:
      //   report      — citations harvested across all 5 section calls
      //                 in this run (each does its own web_search), keyed
      //                 by section id (A-E) for attribution AND deduped
      //                 into a flat list for top-line "all sources" UI.
      //   globalSteep — citations from the Step 2 globalSteepScan call,
      //                 captured in transient state when StepGlobal ran
      //                 (may be empty for reports loaded from a saved
      //                 draft where the user never re-ran step 2).
      const sectionCitations: Record<'A' | 'B' | 'C' | 'D' | 'E', SourceItem[]> = {
        A: summary.status === 'fulfilled' ? summary.value.citations : [],
        B: scenarios.status === 'fulfilled' ? scenarios.value.citations : [],
        C: planning.status === 'fulfilled' ? planning.value.citations : [],
        D: strategicMap.status === 'fulfilled' ? strategicMap.value.citations : [],
        E: backcasting.status === 'fulfilled' ? backcasting.value.citations : [],
      };
      const dedup = (items: SourceItem[]) => {
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
      const hasAnyCitations =
        flatReportCitations.length > 0 || globalSteepCitations.length > 0;
      if (hasAnyCitations) {
        fullResult.sources = {
          report: flatReportCitations,
          bySection: sectionCitations,
          globalSteep: dedup(globalSteepCitations),
        };
      }

      await updateReport.mutateAsync({
        id: targetReportId,
        body: { resultData: fullResult },
      });
      navigate(`/reports/${targetReportId}`);
      // Don't reset isGenerating on success — the unmount handles it.
      // Nudge the assistant — the user has just landed on the report
      // viewer and the chat can proactively offer to walk through the
      // scenarios, explain methodology, or answer questions about the
      // generated sections. Deferred past the navigate() so the route
      // change has time to commit and the report viewer's queries can
      // start populating before the model is woken (the bridge no-ops
      // if the chat was never opened, so this is safe to always fire).
      setTimeout(() => {
        notifyAssistant(
          '[STATE CHANGE: Full foresight analysis just completed and the user has been navigated to the report viewer. The report includes executive summary, 3P scenarios (Probable/Plausible/Possible), scenario planning, backcasting trajectories, strategic priorities, weak signals, wildcards, key uncertainties, and sources. Offer to walk through the scenarios, explain the methodology, or answer questions about any specific section. Keep it short — 2-3 sentences max. Do NOT emit any <command> tags.]',
        );
      }, 50);
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
  // Publish on every relevant state change. No cleanup here — clearing on
  // dep-change as well as unmount caused a brief render where the chat
  // saw {ctx: undefined} sandwiched between the old and new publish, and
  // in StrictMode could leave a stale undefined dangling. The dedicated
  // unmount-only clear below handles route changes correctly.
  useEffect(() => {
    const loaded = editingReport.data;
    setAssistantContext({
      currentStep: step,
      maxReached,
      empresa,
      globalSteep: globalData,
      steep,
      horizon,
      isGenerating,
      // Edit mode publishes the in-progress report so the assistant
      // recognises it as the open report — "this report" resolves to
      // the editing id, same way the read-only viewer publishes it.
      ...(editingId && loaded
        ? {
            viewingReport: {
              id: editingId,
              title: loaded.title,
              status: loaded.status,
              primaryLanguage: loaded.primaryLanguage,
              availableLanguages: loaded.availableLanguages ?? [loaded.primaryLanguage],
              mode: 'edit' as const,
            },
          }
        : {}),
    });
  }, [
    setAssistantContext, step, maxReached, empresa, globalData, steep, horizon,
    isGenerating, editingId, editingReport.data,
  ]);
  useEffect(() => {
    return () => setAssistantContext(undefined);
  }, [setAssistantContext]);

  // Wizard-scoped commands. useCommands snapshots the previous registration
  // for each name on mount and restores it on unmount, so overriding `goTo`
  // here automatically re-installs the shell-level navigation-only version
  // when the user navigates away.
  useCommands(() => [
    {
      name: 'setField',
      // Confirm-mode: the chat assistant emits the command inline as a
      // <command> tag, the renderer surfaces it as a pending chip the user
      // can click (or batch via Apply All), and only then does this handler
      // run. The chip's head/preview is rendered from the chat-side lookup
      // tables; label/preview here are legacy fallbacks for non-chat
      // callers.
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

    // Page-scoped newReport override. The shell-level version just calls
    // navigate('/reports/new') — fine if the user is on a different route,
    // but a no-op when they're already on the wizard (same URL → no
    // remount, state survives). This version clears every wizard slice
    // imperatively so "new report" actually starts from a blank form even
    // when the user is mid-flow.
    {
      name: 'newReport',
      mode: 'auto',
      handler: () => {
        setEmpresa(EMPTY_EMPRESA);
        setGlobalData(EMPTY_GLOBAL_STEEP);
        setSteep(EMPTY_STEEP);
        setHorizon(EMPTY_HORIZON);
        setGlobalSteepCitations([]);
        setReportId(null);
        reportIdRef.current = null;
        setStep(1);
        stepRef.current = 1;
        setMaxReached(1);
        setIsGenerating(false);
        setGenerateError(null);
        // Reset the wizard-session refs so guards behave as if this is a
        // fresh mount: another sector won't be confused with the cleared
        // one for auto-fetch purposes, and prefill won't reapply if the
        // user navigates back into edit mode later.
        globalSteepFetchedForRef.current = null;
        prefilledFor.current = null;
        userHasNavigatedRef.current = false;
        // If the user was on /reports/:id/edit, kick them to /reports/new
        // so the URL matches the cleared state. No-op when already there.
        if (editingId) navigate('/reports/new');
        // Wipe the chat conversation too — the prior brief, scenarios,
        // and Q&A are about a different report and would confuse the
        // assistant's "what's the user looking at?" model on the next
        // turn. The chat re-registers the resetter on mount via the
        // bridge.
        resetAssistant();
        return 'Cleared the form and started a fresh report.';
      },
    },

  ]);

  // Status indicator copy — derives from saveStatus + lastSavedAt. nowMs
  // is the wall-clock timestamp the 15s interval keeps current, so the
  // relative time ("Saved 30s ago") refreshes without us calling Date.now()
  // during render.
  const saveStatusLabel = useMemo<string | null>(() => {
    if (isExampleMode || isGenerating) return null;
    if (saveStatus === 'idle') return null;
    if (saveStatus === 'saving') return t('wizard.saveStatus.saving');
    if (saveStatus === 'dirty') return t('wizard.saveStatus.dirty');
    if (saveStatus === 'error') return t('wizard.saveStatus.error');
    if (saveStatus === 'saved' && lastSavedAt && nowMs > 0) {
      const seconds = Math.floor((nowMs - lastSavedAt.getTime()) / 1000);
      if (seconds < 5) return t('wizard.saveStatus.justSaved');
      if (seconds < 60) return t('wizard.saveStatus.savedSecondsAgo', { count: seconds });
      const minutes = Math.floor(seconds / 60);
      return t('wizard.saveStatus.savedMinutesAgo', { count: minutes });
    }
    return null;
  }, [saveStatus, lastSavedAt, isExampleMode, isGenerating, nowMs, t]);

  // Whether the inline save-row above the form should render at all. The
  // chip is only meaningful while the wizard's input form is on-screen —
  // hidden during analysis (the loader takes over) and in example mode
  // (nothing persists, so a "Saved" hint would be misleading).
  const showSaveRow =
    !!saveStatusLabel &&
    !isGenerating &&
    !isExampleMode &&
    (saveStatus === 'dirty' ||
      saveStatus === 'saving' ||
      saveStatus === 'saved' ||
      saveStatus === 'error');

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
        {/* Autosave indicator — right-aligned above the input form. The
            chip is the same circular badge the topbar used to host; the
            relative-time label ("Saved 15s ago" / "Saving…" / etc.) sits
            inline to its left so the row doesn't look empty when collapsed
            to a single icon. Hidden during analysis and in example mode. */}
        {showSaveRow && (
          <div
            className={`wizard-save-row wizard-save-row--${saveStatus}`}
            role="status"
            aria-live="polite"
          >
            <span className="wizard-save-label">{saveStatusLabel}</span>
            <span
              className={`topbar-save-status topbar-save-status--${saveStatus}`}
              aria-hidden
            >
              {saveStatus === 'saving' ? (
                <span className="topbar-save-spinner" />
              ) : (
                <svg className="topbar-save-ico">
                  <use
                    href={
                      saveStatus === 'saved'
                        ? '#i-check'
                        : saveStatus === 'error'
                          ? '#i-alert'
                          : '#i-edit'
                    }
                  />
                </svg>
              )}
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
              key: 'summary',
              label: t('report.results.progressItems.summary'),
              status: analysisProgress.summary,
              metric: { chars: sectionChars.summary, sources: sectionSources.summary },
            },
            {
              key: 'scenarios',
              label: t('report.results.progressItems.scenarios'),
              status: analysisProgress.scenarios,
              metric: { chars: sectionChars.scenarios, sources: sectionSources.scenarios },
            },
            {
              key: 'planning',
              label: t('report.results.progressItems.scenarioPlanning'),
              status: analysisProgress.planning,
              metric: { chars: sectionChars.planning, sources: sectionSources.planning },
            },
            {
              key: 'strategicMap',
              label: t('report.results.progressItems.strategicMap'),
              status: analysisProgress.strategicMap,
              metric: { chars: sectionChars.strategicMap, sources: sectionSources.strategicMap },
            },
            {
              key: 'backcasting',
              label: t('report.results.progressItems.backcasting'),
              status: analysisProgress.backcasting,
              metric: { chars: sectionChars.backcasting, sources: sectionSources.backcasting },
            },
          ] satisfies ProgressItem[]}
        />
      </Modal>
    </div>
  );
}
