import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { suggestSteep, type SuggestionItem } from '../../../lib/aiClient';
import { extractApiErrorMessage } from '../../../lib/apiError';

const DIMENSION_KEYS = [
  'social',
  'technological',
  'economic',
  'environmental',
  'political',
] as const;

type DimensionKey = (typeof DIMENSION_KEYS)[number];

export type SteepData = Record<DimensionKey, string>;

interface Props {
  data: SteepData;
  companyProfile: string;
  language: 'es' | 'en';
  onChange: (data: SteepData) => void;
  onNext: () => void;
  onBack: () => void;
}

/** Maps STEEP dimensions to (a) the icon-sprite symbol id and (b) the
 *  dim-icon / steep-dim class modifier, both defined in wizard.css. */
const DIM_META: Record<DimensionKey, { icon: string; modifier: string }> = {
  social:        { icon: 'i-s',   modifier: 's'   },
  technological: { icon: 'i-t',   modifier: 't'   },
  economic:      { icon: 'i-e',   modifier: 'e'   },
  environmental: { icon: 'i-env', modifier: 'env' },
  political:     { icon: 'i-p',   modifier: 'p'   },
};

type SuggestionsByDim = Partial<Record<DimensionKey, SuggestionItem[]>>;
type LoadingByDim = Partial<Record<DimensionKey, boolean>>;
type ErrorByDim = Partial<Record<DimensionKey, string>>;

export default function StepSteep({
  data,
  companyProfile,
  language,
  onChange,
  onNext,
  onBack,
}: Props) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<SuggestionsByDim>({});
  const [loading, setLoading] = useState<LoadingByDim>({});
  const [errors, setErrors] = useState<ErrorByDim>({});

  const hasAny = DIMENSION_KEYS.some((k) => data[k].trim());
  const canSuggest = companyProfile.trim().length > 0;

  async function requestSuggestions(dim: DimensionKey) {
    if (!canSuggest) return;
    setLoading((prev) => ({ ...prev, [dim]: true }));
    setErrors((prev) => ({ ...prev, [dim]: undefined }));
    try {
      const items = await suggestSteep({ dimension: dim, companyProfile, language });
      setSuggestions((prev) => ({ ...prev, [dim]: items }));
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [dim]: extractApiErrorMessage(e, t('wizard.steep.errorDefault')),
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [dim]: false }));
    }
  }

  function appendSuggestion(dim: DimensionKey, item: SuggestionItem) {
    const current = data[dim].trimEnd();
    const next = current ? `${current}\n${item.title}` : item.title;
    onChange({ ...data, [dim]: next });
  }

  return (
    <div>
      <div className="eyebrow">{t('wizard.steep.eyebrow')}</div>
      <h1 className="page-title">{t('wizard.steep.title')}</h1>
      <p className="page-desc">{t('wizard.steep.description')}</p>

      <div className="steep-grid">
        {DIMENSION_KEYS.map((key, i) => {
          const isFull = i === DIMENSION_KEYS.length - 1; // Político: full-width
          const dimSuggestions = suggestions[key] ?? [];
          const dimLoading = loading[key] ?? false;
          const dimError = errors[key];
          const meta = DIM_META[key];
          return (
            <div key={key} className={`steep-card${isFull ? ' full' : ''}`}>
              <div className="steep-head">
                <div className="steep-info">
                  <div className={`dim-icon ${meta.modifier}`}>
                    <svg className="ico" aria-hidden>
                      <use href={`#${meta.icon}`} />
                    </svg>
                  </div>
                  <div>
                    <div className={`steep-dim ${meta.modifier}`}>
                      {t(`wizard.steep.dimensions.${key}`)}
                    </div>
                    <div className="steep-sub">{t(`wizard.steep.subs.${key}`)}</div>
                  </div>
                </div>
                <button
                  className="btn btn-ai"
                  type="button"
                  onClick={() => requestSuggestions(key)}
                  disabled={dimLoading || !canSuggest}
                  title={
                    canSuggest
                      ? t('wizard.steep.aiTooltip')
                      : t('wizard.steep.aiTooltipDisabled')
                  }
                >
                  {dimLoading ? <span className="btn-ai-spinner" /> : '✦'}{' '}
                  {t('wizard.steep.aiSuggest')}
                </button>
              </div>

              <textarea
                placeholder={t(`wizard.steep.placeholders.${key}`)}
                value={data[key]}
                onChange={(e) => onChange({ ...data, [key]: e.target.value })}
              />

              {dimSuggestions.length > 0 && (
                <div className="tags-wrap">
                  {dimSuggestions.map((s, j) => (
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

              {dimError && (
                <div className="err-box" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
                  {dimError}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="btn-row">
        <button type="button" className="btn" onClick={onBack}>
          {t('wizard.back')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onNext}
          disabled={!hasAny}
        >
          {t('wizard.steep.next')}
        </button>
      </div>
    </div>
  );
}
