import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { suggestSteep, type SuggestionItem } from '../../../lib/aiClient';
import { extractApiErrorMessage } from '../../../lib/apiError';
import { useMaximizable } from '../../../components/useMaximizable';

const DIMENSION_KEYS = [
  'social',
  'technological',
  'economic',
  'environmental',
  'political',
] as const;

type DimensionKey = (typeof DIMENSION_KEYS)[number];

/** setField target id for each sectorial STEEP dimension. Used to wire
 *  the textarea's HTML id so NewReportPage's setField gold-flash can
 *  find the right element. */
const DIM_FIELD_ID: Record<DimensionKey, string> = {
  social: 'steep-s',
  technological: 'steep-t',
  economic: 'steep-e',
  environmental: 'steep-env',
  political: 'steep-p',
};

export type SteepData = Record<DimensionKey, string>;

interface Props {
  data: SteepData;
  companyProfile: string;
  language: 'es' | 'en' | 'ca';
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

/** Suggestions are capped at 5 per dimension — AI prompt asks for 3–5 but may
 *  occasionally return more; cap defensively so the UI doesn't overflow. */
const MAX_SUGGESTIONS = 5;

type SuggestionsByDim = Partial<Record<DimensionKey, SuggestionItem[]>>;
type LoadingByDim = Partial<Record<DimensionKey, boolean>>;
type ErrorByDim = Partial<Record<DimensionKey, string>>;
type UsedByDim = Partial<Record<DimensionKey, boolean>>;

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
  /** Once the AI has been queried for a dimension we don't allow re-runs —
   *  keeps token cost predictable and matches the demo's behaviour. */
  const [used, setUsed] = useState<UsedByDim>({});
  const max = useMaximizable<DimensionKey>();

  const hasAny = DIMENSION_KEYS.some((k) => data[k].trim());
  const canSuggest = companyProfile.trim().length > 0;

  async function requestSuggestions(dim: DimensionKey) {
    if (!canSuggest || used[dim]) return;
    setLoading((prev) => ({ ...prev, [dim]: true }));
    setErrors((prev) => ({ ...prev, [dim]: undefined }));
    try {
      const items = await suggestSteep({ dimension: dim, companyProfile, language });
      setSuggestions((prev) => ({ ...prev, [dim]: items.slice(0, MAX_SUGGESTIONS) }));
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [dim]: extractApiErrorMessage(e, t('wizard.steep.errorDefault')),
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [dim]: false }));
      // Mark used regardless of outcome — strict one-shot behaviour. If the
      // request errored, the user keeps the visible error and falls back to
      // typing factors by hand.
      setUsed((prev) => ({ ...prev, [dim]: true }));
    }
  }

  function appendSuggestion(dim: DimensionKey, item: SuggestionItem) {
    const current = data[dim].trimEnd();
    const next = current ? `${current}\n${item.title}` : item.title;
    onChange({ ...data, [dim]: next });
  }

  return (
    <div>
      {max.activeKey && (
        <div className="maximize-backdrop" onClick={max.minimize} aria-hidden />
      )}
      <div className="eyebrow">{t('wizard.steep.eyebrow')}</div>
      <h1 className="page-title">{t('wizard.steep.title')}</h1>
      <p className="page-desc">{t('wizard.steep.description')}</p>

      <div className="steep-grid">
        {DIMENSION_KEYS.map((key, i) => {
          const isFull = i === DIMENSION_KEYS.length - 1; // Político: full-width
          const isMax = max.isMaximized(key);
          const dimSuggestions = suggestions[key] ?? [];
          const dimLoading = loading[key] ?? false;
          const dimUsed = used[key] ?? false;
          const dimError = errors[key];
          const meta = DIM_META[key];
          return (
            <div
              key={key}
              className={`steep-card${isFull ? ' full' : ''}${isMax ? ' maximized' : ''}`}
            >
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
                <div className="card-actions">
                  <button
                    className={`btn btn-ai${dimUsed && !dimLoading ? ' used' : ''}`}
                    type="button"
                    onClick={() => requestSuggestions(key)}
                    disabled={dimLoading || dimUsed || !canSuggest}
                    title={
                      canSuggest
                        ? t('wizard.steep.aiTooltip')
                        : t('wizard.steep.aiTooltipDisabled')
                    }
                  >
                    {dimLoading ? <span className="btn-ai-spinner" /> : '✦'}{' '}
                    {t('wizard.steep.aiSuggest')}
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
                id={DIM_FIELD_ID[key]}
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
