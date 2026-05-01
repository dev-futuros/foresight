import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { suggestHorizon, type SuggestionItem } from '../../../lib/aiClient';
import { extractApiErrorMessage } from '../../../lib/apiError';

const HORIZON_KEYS = ['H1', 'H2', 'H3'] as const;

type HorizonKey = (typeof HORIZON_KEYS)[number];

export type HorizonData = Record<HorizonKey, string>;

interface Props {
  data: HorizonData;
  companyProfile: string;
  language: 'es' | 'en';
  onChange: (data: HorizonData) => void;
  onSubmit: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

type SuggestionsByKey = Partial<Record<HorizonKey, SuggestionItem[]>>;
type LoadingByKey = Partial<Record<HorizonKey, boolean>>;
type ErrorByKey = Partial<Record<HorizonKey, string>>;

export default function StepHorizon({
  data,
  companyProfile,
  language,
  onChange,
  onSubmit,
  onBack,
  isSubmitting,
}: Props) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<SuggestionsByKey>({});
  const [loading, setLoading] = useState<LoadingByKey>({});
  const [errors, setErrors] = useState<ErrorByKey>({});

  const hasAny = HORIZON_KEYS.some((k) => data[k].trim());
  const canSuggest = companyProfile.trim().length > 0;

  async function requestSuggestions(horizon: HorizonKey) {
    if (!canSuggest) return;
    setLoading((prev) => ({ ...prev, [horizon]: true }));
    setErrors((prev) => ({ ...prev, [horizon]: undefined }));
    try {
      const items = await suggestHorizon({ horizon, companyProfile, language });
      setSuggestions((prev) => ({ ...prev, [horizon]: items }));
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [horizon]: extractApiErrorMessage(e, t('wizard.horizon.errorDefault')),
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [horizon]: false }));
    }
  }

  function appendSuggestion(horizon: HorizonKey, item: SuggestionItem) {
    const current = data[horizon].trimEnd();
    const next = current ? `${current}\n${item.title}` : item.title;
    onChange({ ...data, [horizon]: next });
  }

  return (
    <div>
      <div className="eyebrow">{t('wizard.horizon.eyebrow')}</div>
      <h1 className="page-title">{t('wizard.horizon.title')}</h1>
      <p className="page-desc">{t('wizard.horizon.description')}</p>

      {HORIZON_KEYS.map((key) => {
        const k = key.toLowerCase();
        const bandSuggestions = suggestions[key] ?? [];
        const bandLoading = loading[key] ?? false;
        const bandError = errors[key];
        return (
          <div key={key} className={`h-card h-card-${k}`}>
            <div className="h-card-head">
              <div className="h-card-head-left">
                <div className={`h-icon h-icon-${k}`}>{key}</div>
                <div>
                  <div className={`h-label h-label-${k}`}>
                    {t(`wizard.horizon.bands.${key}.label`)}
                  </div>
                  <div className="h-sub">{t(`wizard.horizon.bands.${key}.desc`)}</div>
                </div>
              </div>
              <button
                className="btn btn-ai"
                type="button"
                onClick={() => requestSuggestions(key)}
                disabled={bandLoading || !canSuggest}
                title={
                  canSuggest
                    ? t('wizard.horizon.aiTooltip')
                    : t('wizard.horizon.aiTooltipDisabled')
                }
              >
                {bandLoading ? <span className="btn-ai-spinner" /> : '✦'}{' '}
                {t('wizard.horizon.aiSuggest')}
              </button>
            </div>

            <textarea
              placeholder={t(`wizard.horizon.placeholders.${key}`)}
              value={data[key]}
              onChange={(e) => onChange({ ...data, [key]: e.target.value })}
              style={{ minHeight: '80px' }}
            />

            {bandSuggestions.length > 0 && (
              <div className="tags-wrap">
                {bandSuggestions.map((s, j) => (
                  <button
                    key={j}
                    type="button"
                    className="sug-tag"
                    title={s.description}
                    onClick={() => appendSuggestion(key, s)}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            )}

            {bandError && (
              <div className="err-box" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
                {bandError}
              </div>
            )}
          </div>
        );
      })}

      <div className="btn-row">
        <button type="button" className="btn" onClick={onBack} disabled={isSubmitting}>
          {t('wizard.back')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSubmit}
          disabled={!hasAny || isSubmitting}
        >
          {isSubmitting ? <span className="btn-spinner" /> : t('wizard.horizon.submit')}
        </button>
      </div>
    </div>
  );
}
