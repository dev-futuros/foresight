import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { suggestHorizon, type SuggestionItem } from '../../../lib/aiClient';
import { extractApiErrorMessage } from '../../../lib/apiError';
import { useMaximizable } from '../../../components/useMaximizable';

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
  /** Surfaced as a global error box above the action row when the parent's
   *  generate-analysis pipeline (create → analyze → update) fails. */
  error?: string | null;
}

/** Cap suggestions defensively — AI is asked for 3–5 but may return more. */
const MAX_SUGGESTIONS = 5;

type SuggestionsByKey = Partial<Record<HorizonKey, SuggestionItem[]>>;
type LoadingByKey = Partial<Record<HorizonKey, boolean>>;
type ErrorByKey = Partial<Record<HorizonKey, string>>;
type UsedByKey = Partial<Record<HorizonKey, boolean>>;

export default function StepHorizon({
  data,
  companyProfile,
  language,
  onChange,
  onSubmit,
  onBack,
  isSubmitting,
  error,
}: Props) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<SuggestionsByKey>({});
  const [loading, setLoading] = useState<LoadingByKey>({});
  const [errors, setErrors] = useState<ErrorByKey>({});
  /** Mirror of StepSteep: one shot per horizon, no re-runs. */
  const [used, setUsed] = useState<UsedByKey>({});
  const max = useMaximizable<HorizonKey>();

  const hasAny = HORIZON_KEYS.some((k) => data[k].trim());
  const canSuggest = companyProfile.trim().length > 0;

  async function requestSuggestions(horizon: HorizonKey) {
    if (!canSuggest || used[horizon]) return;
    setLoading((prev) => ({ ...prev, [horizon]: true }));
    setErrors((prev) => ({ ...prev, [horizon]: undefined }));
    try {
      const items = await suggestHorizon({ horizon, companyProfile, language });
      setSuggestions((prev) => ({ ...prev, [horizon]: items.slice(0, MAX_SUGGESTIONS) }));
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [horizon]: extractApiErrorMessage(e, t('wizard.horizon.errorDefault')),
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [horizon]: false }));
      // One-shot: mark used regardless of outcome so the user can't spam the
      // AI on errors. They can still type signals manually.
      setUsed((prev) => ({ ...prev, [horizon]: true }));
    }
  }

  function appendSuggestion(horizon: HorizonKey, item: SuggestionItem) {
    const current = data[horizon].trimEnd();
    const next = current ? `${current}\n${item.title}` : item.title;
    onChange({ ...data, [horizon]: next });
  }

  return (
    <div>
      {max.activeKey && (
        <div className="maximize-backdrop" onClick={max.minimize} aria-hidden />
      )}
      <div className="eyebrow">{t('wizard.horizon.eyebrow')}</div>
      <h1 className="page-title">{t('wizard.horizon.title')}</h1>
      <p className="page-desc">{t('wizard.horizon.description')}</p>

      <div className="horizon-stack">
        {HORIZON_KEYS.map((key) => {
          const k = key.toLowerCase(); // 'h1' | 'h2' | 'h3' — both class modifier and dim-icon variant
          const isMax = max.isMaximized(key);
          const bandSuggestions = suggestions[key] ?? [];
          const bandLoading = loading[key] ?? false;
          const bandUsed = used[key] ?? false;
          const bandError = errors[key];
          return (
            <div key={key} className={`h-card ${k}${isMax ? ' maximized' : ''}`}>
              <div className="h-card-head">
                <div className="h-card-head-left">
                  <div className={`dim-icon ${k}`}>{key}</div>
                  <div>
                    <div className={`h-label ${k}`}>
                      {t(`wizard.horizon.bands.${key}.label`)}
                    </div>
                    <div className="h-sub">{t(`wizard.horizon.bands.${key}.desc`)}</div>
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    className={`btn btn-ai${bandUsed && !bandLoading ? ' used' : ''}`}
                    type="button"
                    onClick={() => requestSuggestions(key)}
                    disabled={bandLoading || bandUsed || !canSuggest}
                    title={
                      canSuggest
                        ? t('wizard.horizon.aiTooltip')
                        : t('wizard.horizon.aiTooltipDisabled')
                    }
                  >
                    {bandLoading ? <span className="btn-ai-spinner" /> : '✦'}{' '}
                    {t('wizard.horizon.aiSuggest')}
                  </button>
                  <button
                    type="button"
                    className="maximize-btn"
                    onClick={() => max.toggle(key)}
                    aria-label={isMax ? t('wizard.minimize') : t('wizard.maximize')}
                    title={isMax ? t('wizard.minimize') : t('wizard.maximize')}
                  >
                    <svg className="ico" aria-hidden>
                      <use href={`#${isMax ? 'i-minimize' : 'i-maximize'}`} />
                    </svg>
                  </button>
                </div>
              </div>

              <textarea
                placeholder={t(`wizard.horizon.placeholders.${key}`)}
                value={data[key]}
                onChange={(e) => onChange({ ...data, [key]: e.target.value })}
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
      </div>

      {error && <div className="err-box">{error}</div>}

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
