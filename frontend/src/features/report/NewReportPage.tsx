import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCreateReport } from '../../hooks/useReports';
import { useCurrentUser } from '../../hooks/useAuth';
import { useSetStepper } from '../shell/StepperContext';
import StepEmpresa, { type EmpresaData } from './steps/StepEmpresa';
import StepGlobal, { type GlobalSteepData } from './steps/StepGlobal';
import StepSteep, { type SteepData } from './steps/StepSteep';
import StepHorizon, { type HorizonData } from './steps/StepHorizon';
import './wizard.css';

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
  const { data: user } = useCurrentUser();
  const [step, setStep] = useState(1);
  // Highest step the user has ever reached. Lets the stepper allow forward
  // jumps to already-visited steps in addition to back-nav.
  const [maxReached, setMaxReached] = useState(1);

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

  // Step bar mirrors the demo verbatim: 6 items including the post-submit "Análisis"
  // and "Resultados" tabs. The wizard itself only navigates through 1-4; 5-6 are
  // surfaced visually so the progression matches the prototype.
  const steps = useMemo(
    () => [
      { n: 1, label: t('wizard.steps.empresa') },
      { n: 2, label: t('wizard.steps.global') },
      { n: 3, label: t('wizard.steps.steep') },
      { n: 4, label: t('wizard.steps.horizon') },
      { n: 5, label: t('wizard.steps.analysis') },
      { n: 6, label: t('wizard.steps.results') },
    ],
    [t],
  );

  // Push step state up to the AppShell so the sticky stepper renders below the
  // topbar. Memoised so useSetStepper's effect only re-fires when the user
  // navigates a step or the locale changes (steps array re-built from t).
  const stepperState = useMemo(
    () => ({ steps, current: step, maxReached, onSelect: goToStep }),
    [steps, step, maxReached, goToStep],
  );
  useSetStepper(stepperState);

  const companyProfile = empresa.name
    ? `${empresa.name} — ${empresa.sector}. ${empresa.challenge}. (${empresa.horizon}y)`
    : '';

  async function handleSubmit() {
    const customTitle = empresa.title.trim();
    const title = customTitle || `${empresa.name} — Foresight ${new Date().getFullYear()}`;
    const report = await createReport.mutateAsync({
      title,
      inputData: {
        companyProfile: empresa,
        globalSteep: globalData,
        steep,
        horizon,
      },
    });
    navigate(`/reports/${report.id}`);
  }

  return (
    <div className="wizard">
      <main className="main">
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
            isSubmitting={createReport.isPending}
          />
        )}
      </main>
    </div>
  );
}
