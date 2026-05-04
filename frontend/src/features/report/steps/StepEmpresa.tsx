import { useTranslation } from 'react-i18next';

export interface EmpresaData {
  name: string;
  sector: string;
  size: string;
  horizon: string;
  market: string;
  challenge: string;
  strengths: string;
  consultantName: string;
  consultantCompany: string;
  /** Optional custom report title. When blank, NewReportPage falls back to a generated one. */
  title: string;
}

interface Props {
  data: EmpresaData;
  onChange: (data: EmpresaData) => void;
  onNext: () => void;
}

const HORIZON_VALUES = ['3', '5', '10'] as const;
const SIZE_VALUES = ['startup', 'pyme', 'mediana', 'grande'] as const;
const MARKET_VALUES = ['local', 'european', 'global'] as const;

export default function StepEmpresa({ data, onChange, onNext }: Props) {
  const { t } = useTranslation();
  const valid =
    data.name.trim() && data.sector.trim() && data.challenge.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (valid) onNext();
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="eyebrow">{t('wizard.empresa.eyebrow')}</div>
      <h1 className="page-title">{t('wizard.empresa.title')}</h1>
      <p className="page-desc">{t('wizard.empresa.description')}</p>

      <div className="card">
        <div className="g2">
          <div className="field">
            <label htmlFor="f-name">{t('wizard.empresa.name')}</label>
            <input
              id="f-name"
              type="text"
              placeholder={t('wizard.empresa.namePlaceholder')}
              value={data.name}
              onChange={(e) => onChange({ ...data, name: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="f-sector">{t('wizard.empresa.sector')}</label>
            <input
              id="f-sector"
              type="text"
              placeholder={t('wizard.empresa.sectorPlaceholder')}
              value={data.sector}
              onChange={(e) => onChange({ ...data, sector: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="g3">
          <div className="field">
            <label htmlFor="f-size">{t('wizard.empresa.size')}</label>
            <select
              id="f-size"
              value={data.size}
              onChange={(e) => onChange({ ...data, size: e.target.value })}
            >
              <option value="">{t('wizard.empresa.sizeSelect')}</option>
              {SIZE_VALUES.map((v) => (
                <option key={v} value={v}>
                  {t(`wizard.empresa.sizeOption.${v}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-horizon">{t('wizard.empresa.horizon')}</label>
            <select
              id="f-horizon"
              value={data.horizon}
              onChange={(e) => onChange({ ...data, horizon: e.target.value })}
            >
              {HORIZON_VALUES.map((v) => (
                <option key={v} value={v}>
                  {t('wizard.empresa.horizonOption', { value: v })}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-market">{t('wizard.empresa.market')}</label>
            <select
              id="f-market"
              value={data.market}
              onChange={(e) => onChange({ ...data, market: e.target.value })}
            >
              {MARKET_VALUES.map((v) => (
                <option key={v} value={v}>
                  {t(`wizard.empresa.marketOption.${v}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="f-challenge">{t('wizard.empresa.challenge')}</label>
          <textarea
            id="f-challenge"
            placeholder={t('wizard.empresa.challengePlaceholder')}
            value={data.challenge}
            onChange={(e) => onChange({ ...data, challenge: e.target.value })}
            required
          />
        </div>

        <div className="field field-flush">
          <label htmlFor="f-strengths">{t('wizard.empresa.strengths')}</label>
          <textarea
            id="f-strengths"
            placeholder={t('wizard.empresa.strengthsPlaceholder')}
            value={data.strengths}
            onChange={(e) => onChange({ ...data, strengths: e.target.value })}
            style={{ minHeight: '60px' }}
          />
        </div>
      </div>

      <div className="card" style={{ borderColor: 'var(--border-a)', marginTop: '0.75rem' }}>
        <div className="card-label">{t('wizard.empresa.consultantLabel')}</div>
        <div className="g2">
          <div className="field field-flush">
            <label htmlFor="f-consultant-name">{t('wizard.empresa.consultantName')}</label>
            <input
              id="f-consultant-name"
              type="text"
              placeholder={t('wizard.empresa.consultantNamePlaceholder')}
              value={data.consultantName}
              onChange={(e) => onChange({ ...data, consultantName: e.target.value })}
            />
          </div>
          <div className="field field-flush">
            <label htmlFor="f-consultant-company">{t('wizard.empresa.consultantCompany')}</label>
            <input
              id="f-consultant-company"
              type="text"
              placeholder={t('wizard.empresa.consultantCompanyPlaceholder')}
              value={data.consultantCompany}
              onChange={(e) => onChange({ ...data, consultantCompany: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ borderColor: 'var(--border-a)', marginTop: '0.75rem' }}>
        <div className="card-label">{t('wizard.empresa.titleLabel')}</div>
        <div className="field field-flush">
          <label htmlFor="f-title">{t('wizard.empresa.titleField')}</label>
          <input
            id="f-title"
            type="text"
            placeholder={t('wizard.empresa.titlePlaceholder', {
              fallback: data.name
                ? `${data.name} — Foresight ${new Date().getFullYear()}`
                : '',
            })}
            value={data.title}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
          />
        </div>
      </div>

      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={!valid}>
          {t('wizard.empresa.next')}
        </button>
      </div>
    </form>
  );
}
