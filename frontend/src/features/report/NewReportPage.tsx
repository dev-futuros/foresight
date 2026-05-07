import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCreateReport, useReport, useUpdateReport } from '../../hooks/useReports';
import { useCurrentUser } from '../../hooks/useAuth';
import { useSetStepper } from '../shell/StepperContext';
import { analyze } from '../../lib/aiClient';
import { extractApiErrorMessage } from '../../lib/apiError';
import OnboardingDialog from '../../components/OnboardingDialog';
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
  // Combined create + analyze + update pipeline state. Set when the user
  // clicks "Generate analysis" on step 4 and stays true until either the
  // report is fully built (we navigate away) or the pipeline errors.
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
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

  const goToStep = useCallback((n: number) => {
    setStep(n);
    setMaxReached((prev) => Math.max(prev, n));
  }, []);

  const language: 'es' | 'en' =
    user?.language === 'en' || i18n.language === 'en' ? 'en' : 'es';

  const [empresa, setEmpresa] = useState<EmpresaData>(EMPTY_EMPRESA);
  const [globalData, setGlobalData] = useState<GlobalSteepData>(EMPTY_GLOBAL_STEEP);
  const [steep, setSteep] = useState<SteepData>(EMPTY_STEEP);
  const [horizon, setHorizon] = useState<HorizonData>(EMPTY_HORIZON);

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
    };
    if (inputs.companyProfile) setEmpresa({ ...EMPTY_EMPRESA, ...inputs.companyProfile });
    if (inputs.globalSteep) setGlobalData({ ...EMPTY_GLOBAL_STEEP, ...inputs.globalSteep });
    if (inputs.steep) setSteep({ ...EMPTY_STEEP, ...inputs.steep });
    if (inputs.horizon) setHorizon({ ...EMPTY_HORIZON, ...inputs.horizon });
  }, [editMode, editingReport.data]);

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
    const customTitle = empresa.title.trim();
    const title = customTitle || `${empresa.name} — Foresight ${new Date().getFullYear()}`;
    const inputData = {
      companyProfile: empresa,
      globalSteep: globalData,
      steep,
      horizon,
    };
    setGenerateError(null);
    setIsGenerating(true);
    try {
      // 1. Persist inputs. New reports go through POST; edits PATCH the
      //    existing record so the dashboard list and any export bookmarks
      //    keep pointing at the same id.
      const reportId = editingId
        ? (await updateReport.mutateAsync({
            id: editingId,
            body: { title, inputData },
          })).id
        : (await createReport.mutateAsync({ title, inputData })).id;
      // 2. Run the AI analysis. Failure here leaves the report unchanged
      //    on the result side — the user sees the inline error and retries.
      const result = await analyze({
        companyProfile: empresa,
        steep,
        horizon,
        language,
      });
      // 3. Patch the report with the result so ReportPage shows it directly.
      await updateReport.mutateAsync({
        id: reportId,
        body: { resultData: result as unknown as Record<string, unknown> },
      });
      navigate(`/reports/${reportId}`);
      // Don't reset isGenerating on success — the unmount handles it.
    } catch (e) {
      setGenerateError(extractApiErrorMessage(e, t('report.results.errorDefault')));
      setIsGenerating(false);
    }
  }

  return (
    <div className="wizard">
      <main className="main">
        {isGenerating ? (
          <div className="loading-wrap">
            <div className="spinner" aria-hidden />
            <p className="loading-head">{t('report.results.analyzing')}</p>
          </div>
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
