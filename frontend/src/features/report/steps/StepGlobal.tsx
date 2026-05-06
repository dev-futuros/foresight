import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { globalSteep, type GlobalSteep } from '../../../lib/aiClient';
import { extractApiErrorMessage } from '../../../lib/apiError';

const FIELD_KEYS = ['S', 'T', 'E', 'ENV', 'P'] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

export type GlobalSteepData = GlobalSteep;

interface Props {
  data: GlobalSteepData;
  sector: string;
  language: 'es' | 'en';
  onChange: (data: GlobalSteepData) => void;
  onNext: () => void;
  onBack: () => void;
}

/** Maps STEEP field keys to (a) the icon-sprite symbol id and (b) the
 *  dim-icon / steep-dim class modifier, both defined in wizard.css. */
const DIM_META: Record<FieldKey, { icon: string; modifier: string }> = {
  S:   { icon: 'i-s',   modifier: 's'   },
  T:   { icon: 'i-t',   modifier: 't'   },
  E:   { icon: 'i-e',   modifier: 'e'   },
  ENV: { icon: 'i-env', modifier: 'env' },
  P:   { icon: 'i-p',   modifier: 'p'   },
};

const EMPTY_LOADING: Record<FieldKey, boolean> = {
  S: false,
  T: false,
  E: false,
  ENV: false,
  P: false,
};

export default function StepGlobal({
  data,
  sector,
  language,
  onChange,
  onNext,
  onBack,
}: Props) {
  const { t } = useTranslation();
  // The initial fetch loads all 5 dimensions and is gated on `bulkLoading`
  // (full-page spinner with cycling progress copy). Per-card regeneration uses
  // `cardLoading[key]` so the user can tap "↺" on a single card without
  // freezing the rest of the form.
  const [bulkLoading, setBulkLoading] = useState(false);
  const [cardLoading, setCardLoading] = useState<Record<FieldKey, boolean>>(EMPTY_LOADING);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const fetchedFor = useRef<string | null>(null);

  const hasAny = FIELD_KEYS.some((k) => data[k].trim());
  const anyCardLoading = FIELD_KEYS.some((k) => cardLoading[k]);

  async function fetchAll() {
    if (!sector.trim()) return;
    setBulkLoading(true);
    setError(null);
    setProgressMsg(t('wizard.global.progress.0'));

    const messages = [
      t('wizard.global.progress.0'),
      t('wizard.global.progress.1'),
      t('wizard.global.progress.2', { sector }),
    ];
    let i = 0;
    const interval = window.setInterval(() => {
      i = (i + 1) % messages.length;
      setProgressMsg(messages[i]);
    }, 2000);

    try {
      const result = await globalSteep({ sector, language });
      onChange({
        S: result.S ?? '',
        T: result.T ?? '',
        E: result.E ?? '',
        ENV: result.ENV ?? '',
        P: result.P ?? '',
      });
    } catch (e) {
      setError(extractApiErrorMessage(e, t('wizard.global.errorDefault')));
      fetchedFor.current = null;
    } finally {
      window.clearInterval(interval);
      setBulkLoading(false);
    }
  }

  async function regenerateOne(dim: FieldKey) {
    if (!sector.trim()) return;
    setCardLoading((s) => ({ ...s, [dim]: true }));
    setError(null);
    try {
      const result = await globalSteep({ sector, language, dimension: dim });
      // Only merge the requested key — the backend may return just that one,
      // but if it returned more we still ignore the extras.
      onChange({ ...data, [dim]: result[dim] ?? '' });
    } catch (e) {
      setError(extractApiErrorMessage(e, t('wizard.global.errorDefault')));
    } finally {
      setCardLoading((s) => ({ ...s, [dim]: false }));
    }
  }

  useEffect(() => {
    if (!hasAny && sector.trim() && fetchedFor.current !== sector) {
      // Claim this sector synchronously BEFORE the async fetch starts. React 18 StrictMode
      // double-mounts effects in dev, so the second pass would otherwise see the ref still
      // null and fire a duplicate request (wasting an Anthropic call). On error we reset
      // the ref so the next render can retry.
      fetchedFor.current = sector;
      void fetchAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sector]);

  const showContent = !bulkLoading;

  return (
    <div>
      <div className="eyebrow">{t('wizard.global.eyebrow')}</div>
      <h1 className="page-title">{t('wizard.global.title')}</h1>
      <p className="page-desc">{t('wizard.global.description')}</p>

      {bulkLoading && (
        <div className="loading-wrap">
          <div className="spinner" aria-hidden />
          <p className="loading-head">{progressMsg || t('wizard.global.progress.0')}</p>
        </div>
      )}

      {showContent && (
        <>
          <div className="callout">
            <div className="callout-icon">
              <svg className="ico" aria-hidden><use href="#i-globe" /></svg>
            </div>
            <span className="callout-text">{t('wizard.global.banner')}</span>
          </div>

          <div className="steep-grid">
            {FIELD_KEYS.map((key, i) => {
              const isFull = i === FIELD_KEYS.length - 1;
              const isLoading = cardLoading[key];
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
                          {t(`wizard.global.dimensions.${key}`)}
                        </div>
                        <div className="steep-sub">{t(`wizard.global.subs.${key}`)}</div>
                      </div>
                    </div>
                    <button
                      className="btn-ghost"
                      type="button"
                      onClick={() => regenerateOne(key)}
                      disabled={!sector.trim() || isLoading}
                    >
                      {isLoading ? (
                        <span className="btn-spinner" aria-hidden />
                      ) : (
                        <>↺ {t('wizard.global.regenerate')}</>
                      )}
                    </button>
                  </div>
                  <textarea
                    value={data[key]}
                    onChange={(e) => onChange({ ...data, [key]: e.target.value })}
                    disabled={isLoading}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      {error && <div className="err-box">{error}</div>}

      <div className="btn-row">
        <button type="button" className="btn" onClick={onBack} disabled={bulkLoading || anyCardLoading}>
          {t('wizard.back')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onNext}
          disabled={bulkLoading || anyCardLoading}
        >
          {t('wizard.global.next')}
        </button>
      </div>
    </div>
  );
}
