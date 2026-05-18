import { useTranslation } from 'react-i18next';
import SplitButton from '../../../components/SplitButton';
import '../../../components/splitButton.css';

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
  /**
   * True when Step 2's Global STEEP has been filled (any of the 5
   * dimensions has content). Drives which option the split-button
   * defaults to — "Continue" when full, "Generate" when empty. The
   * dropdown always carries the other option, so either path is one
   * click away regardless of state.
   */
  hasGlobalSteep?: boolean;
  /**
   * Continue to step 2 without regenerating. Parent should claim the
   * Step 2 auto-fetch ref so the user lands on step 2 without a
   * surprise re-generation (relevant when fields happen to be empty —
   * the user is signalling "I'll fill it manually").
   */
  onContinue: () => void;
  /**
   * Wipe Global STEEP state + auto-fetch ref so step 2 re-generates
   * on entry. Parent owns the state, this component just emits intent.
   */
  onGenerate: () => void;
  /**
   * When true (wizard is loaded against a global example), the
   * Generate path is omitted entirely — the SplitButton becomes a
   * plain Continue button. Generating would spend AI budget against
   * read-only content and the result would not persist.
   */
  disableGenerate?: boolean;
}

const HORIZON_VALUES = ['3', '5', '10'] as const;
const SIZE_VALUES = ['startup', 'pyme', 'mediana', 'grande'] as const;
const MARKET_VALUES = ['local', 'european', 'global'] as const;

export default function StepEmpresa({
  data,
  onChange,
  hasGlobalSteep,
  onContinue,
  onGenerate,
  disableGenerate = false,
}: Props) {
  const { t } = useTranslation();
  const valid = data.name.trim() && data.sector.trim() && data.challenge.trim();

  // Enter-key fallback inside text fields. Always runs the "default" path
  // for the current state (Continue when full, Generate when empty), so
  // the keyboard shortcut matches the SplitButton's primary slot. In
  // example mode there's no Generate path at all — fall through to
  // Continue so Enter still progresses the wizard.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    if (hasGlobalSteep || disableGenerate) onContinue();
    else onGenerate();
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

        <div className="field">
          <label htmlFor="f-strengths">{t('wizard.empresa.strengths')}</label>
          <textarea
            id="f-strengths"
            placeholder={t('wizard.empresa.strengthsPlaceholder')}
            value={data.strengths}
            onChange={(e) => onChange({ ...data, strengths: e.target.value })}
          />
        </div>
      </div>

      <div className="card is-accent">
        <div className="card-label">{t('wizard.empresa.consultantLabel')}</div>
        <div className="g2">
          <div className="field">
            <label htmlFor="f-consultant-name">{t('wizard.empresa.consultantName')}</label>
            <input
              id="f-consultant-name"
              type="text"
              placeholder={t('wizard.empresa.consultantNamePlaceholder')}
              value={data.consultantName}
              onChange={(e) => onChange({ ...data, consultantName: e.target.value })}
            />
          </div>
          <div className="field">
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

      <div className="card is-accent">
        <div className="card-label">{t('wizard.empresa.titleLabel')}</div>
        <div className="field">
          <label htmlFor="f-title">{t('wizard.empresa.titleField')}</label>
          <input
            id="f-title"
            type="text"
            placeholder={t('wizard.empresa.titlePlaceholder', {
              fallback: data.name ? `${data.name} — Foresight ${new Date().getFullYear()}` : '',
            })}
            value={data.title}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
          />
        </div>
      </div>

      <div className="btn-row">
        {/* Both options are always passed in. The SplitButton picks one
            as the primary slot based on `primary={...}` (driven by
            hasGlobalSteep) and shows the other in the always-visible
            dropdown — so the user can swap modes in one click whether
            Global STEEP is filled or empty. */}
        {(() => {
          const continueOption = {
            key: 'continue' as const,
            label: t('wizard.empresa.nextContinue'),
            onClick: () => {
              if (valid) onContinue();
            },
          };
          const generateOption = {
            key: 'generate' as const,
            label: t('wizard.empresa.next'),
            onClick: () => {
              if (valid) onGenerate();
            },
          };
          // Example mode: Generate is omitted entirely. The SplitButton
          // collapses to a single Continue button (the dropdown is
          // empty so the chevron doesn't render).
          const primaryOption = hasGlobalSteep || disableGenerate ? continueOption : generateOption;
          const altOptions = disableGenerate
            ? []
            : [hasGlobalSteep ? generateOption : continueOption];
          return (
            <SplitButton
              disabled={!valid}
              menuAriaLabel={t('wizard.empresa.nextMenuAria')}
              primary={primaryOption}
              options={altOptions}
            />
          );
        })()}
      </div>
    </form>
  );
}
