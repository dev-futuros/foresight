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

const ICONS: Record<FieldKey, string> = {
  S: '👥',
  T: '⚡',
  E: '💹',
  ENV: '🌱',
  P: '🏛️',
};
const ICON_BG: Record<FieldKey, string> = {
  S: 'rgba(96,165,250,0.08)',
  T: 'rgba(74,222,128,0.08)',
  E: 'rgba(212,168,83,0.08)',
  ENV: 'rgba(134,239,172,0.08)',
  P: 'rgba(192,132,252,0.08)',
};
const DIM_COLOR: Record<FieldKey, string> = {
  S: 'var(--blue)',
  T: 'var(--green)',
  E: 'var(--accent)',
  ENV: '#86efac',
  P: 'var(--purple)',
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
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const fetchedFor = useRef<string | null>(null);

  const hasAny = FIELD_KEYS.some((k) => data[k].trim());

  async function fetchGlobalSteep() {
    if (!sector.trim()) return;
    setLoading(true);
    setError(null);
    setProgressMsg(t('wizard.global.progress.0'));

    // Demo cycles three messages every 2s while the request is in flight
    // (Futuros.html:966-972).
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
      fetchedFor.current = sector;
    } catch (e) {
      setError(extractApiErrorMessage(e, t('wizard.global.errorDefault')));
    } finally {
      window.clearInterval(interval);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasAny && sector.trim() && fetchedFor.current !== sector) {
      void fetchGlobalSteep();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sector]);

  // Demo (Futuros.html:458-501): while loading the `gs-loading` row is visible and
  // `gs-content` is hidden via `.hidden`. After the fetch the loading row hides and
  // the content becomes visible. Error block lives below the grid as a separate node.
  const showContent = !loading;

  return (
    <div>
      <div className="eyebrow">{t('wizard.global.eyebrow')}</div>
      <h1 className="page-title">{t('wizard.global.title')}</h1>
      <p className="page-desc">{t('wizard.global.description')}</p>

      {loading && (
        <div className="global-loading">
          <div className="spinner" />
          <span className="global-loading-text">
            {progressMsg || t('wizard.global.progress.0')}
          </span>
        </div>
      )}

      {showContent && (
        <>
          <div className="global-banner">
            <span className="global-banner-icon">🌍</span>
            <span className="global-banner-text">{t('wizard.global.banner')}</span>
          </div>

          <div className="steep-grid">
            {FIELD_KEYS.map((key, i) => {
              const isFull = i === FIELD_KEYS.length - 1;
              return (
                <div key={key} className={`steep-card${isFull ? ' full' : ''}`}>
                  <div className="steep-head">
                    <div className="steep-info">
                      <div className="steep-icon" style={{ background: ICON_BG[key] }}>
                        {ICONS[key]}
                      </div>
                      <div>
                        <div
                          className="steep-dim"
                          style={{ color: DIM_COLOR[key], opacity: 0.8 }}
                        >
                          {t(`wizard.global.dimensions.${key}`)}
                        </div>
                        <div className="steep-sub">{t(`wizard.global.subs.${key}`)}</div>
                      </div>
                    </div>
                    {isFull && (
                      <button
                        className="btn-ghost"
                        type="button"
                        onClick={fetchGlobalSteep}
                        disabled={!sector.trim()}
                        style={{ fontSize: '0.68rem' }}
                      >
                        ↺ {t('wizard.global.regenerate')}
                      </button>
                    )}
                  </div>
                  <textarea
                    value={data[key]}
                    onChange={(e) => onChange({ ...data, [key]: e.target.value })}
                    style={{ minHeight: '72px', opacity: 0.9 }}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      {error && <div className="err-box">{error}</div>}

      <div className="btn-row">
        <button type="button" className="btn" onClick={onBack} disabled={loading}>
          {t('wizard.back')}
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext} disabled={loading}>
          {t('wizard.global.next')}
        </button>
      </div>
    </div>
  );
}
