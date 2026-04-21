import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCreateReport } from '../../hooks/useReports';
import StepEmpresa, { type EmpresaData } from './steps/StepEmpresa';
import StepSteep, { type SteepData } from './steps/StepSteep';
import StepHorizon, { type HorizonData } from './steps/StepHorizon';
import './wizard.css';

const STEPS = [
  { n: 1, label: 'Empresa' },
  { n: 2, label: 'STEEP' },
  { n: 3, label: 'Horizon Scan' },
];

const EMPTY_STEEP: SteepData = {
  social: '', technological: '', economic: '', environmental: '', political: '',
};
const EMPTY_HORIZON: HorizonData = { H1: '', H2: '', H3: '' };

export default function NewReportPage() {
  const navigate = useNavigate();
  const createReport = useCreateReport();
  const [step, setStep] = useState(1);

  const [empresa, setEmpresa] = useState<EmpresaData>({
    name: '', sector: '', horizon: '5', challenge: '',
  });
  const [steep, setSteep] = useState<SteepData>(EMPTY_STEEP);
  const [horizon, setHorizon] = useState<HorizonData>(EMPTY_HORIZON);

  const companyProfile = empresa.name
    ? `${empresa.name} — ${empresa.sector}. Reto: ${empresa.challenge}. Horizonte: ${empresa.horizon} años.`
    : '';

  async function handleSubmit() {
    const report = await createReport.mutateAsync({
      title: `${empresa.name} — Foresight ${new Date().getFullYear()}`,
      inputData: { companyProfile: empresa, steep, horizon },
    });
    navigate(`/reports/${report.id}`);
  }

  return (
    <div className="wizard">
      <nav className="wizard-nav">
        <Link to="/dashboard" className="wizard-nav-logo">
          <div className="wizard-nav-mark">F</div>
          <span className="wizard-nav-text">Futuros</span>
        </Link>
        <div className="step-bar">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className={`step-item ${step === s.n ? 'active' : ''} ${step > s.n ? 'done' : ''}`}
            >
              <div className="step-dot">{step > s.n ? '✓' : s.n}</div>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </nav>

      <main className="wizard-main">
        {step === 1 && (
          <StepEmpresa
            data={empresa}
            onChange={setEmpresa}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepSteep
            data={steep}
            companyProfile={companyProfile}
            onChange={setSteep}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <StepHorizon
            data={horizon}
            companyProfile={companyProfile}
            onChange={setHorizon}
            onSubmit={handleSubmit}
            onBack={() => setStep(2)}
            isSubmitting={createReport.isPending}
          />
        )}
      </main>
    </div>
  );
}
