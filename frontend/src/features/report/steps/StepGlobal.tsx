import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { globalSteep, type GlobalSteep } from '../../../lib/aiClient';
import { extractApiErrorMessage } from '../../../lib/apiError';
import { useMaximizable } from '../../../components/useMaximizable';
import LoadingPanel, {
  type ProgressItem,
  type ProgressItemStatus,
} from '../../../components/LoadingPanel';
import { useCommands } from '../../../lib/useCommands';

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

export default function StepGlobal({
  data,
  sector,
  language,
  onChange,
  onNext,
  onBack,
}: Props) {
  const { t } = useTranslation();
  // Initial fetch loads all 5 dimensions and is gated on `bulkLoading` (full-
  // page spinner with cycling progress copy). Per-card regeneration was
  // removed in favour of a single up-front compute when entering the step;
  // the user can edit the textareas freely after that.
  const [bulkLoading, setBulkLoading] = useState(false);
  const [progressStatus, setProgressStatus] = useState<
    Record<'search' | 'macro' | 'sector', ProgressItemStatus>
  >({ search: 'pending', macro: 'pending', sector: 'pending' });
  const [error, setError] = useState<string | null>(null);
  const fetchedFor = useRef<string | null>(null);
  const max = useMaximizable<FieldKey>();

  const hasAny = FIELD_KEYS.some((k) => data[k].trim());

  async function fetchAll() {
    if (!sector.trim()) return;
    setBulkLoading(true);
    setError(null);
    // Simulated timeline: each item lights up sequentially while the single
    // /api/ai/global-steep call is in flight. The backend doesn't expose
    // per-stage events, so the cadence is heuristic — picked to roughly
    // match the typical 15-30s response window.
    setProgressStatus({ search: 'running', macro: 'pending', sector: 'pending' });
    const t1 = window.setTimeout(() => {
      setProgressStatus((prev) =>
        prev.search === 'running'
          ? { ...prev, search: 'done', macro: 'running' }
          : prev,
      );
    }, 6000);
    const t2 = window.setTimeout(() => {
      setProgressStatus((prev) =>
        prev.macro === 'running'
          ? { ...prev, macro: 'done', sector: 'running' }
          : prev,
      );
    }, 14000);

    try {
      const result = await globalSteep({ sector, language });
      onChange({
        S: result.S ?? '',
        T: result.T ?? '',
        E: result.E ?? '',
        ENV: result.ENV ?? '',
        P: result.P ?? '',
      });
      setProgressStatus({ search: 'done', macro: 'done', sector: 'done' });
    } catch (e) {
      setError(extractApiErrorMessage(e, t('wizard.global.errorDefault')));
      fetchedFor.current = null;
    } finally {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      setBulkLoading(false);
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

  /** Wipes the textareas, resets the fetched-for guard, and forces a fresh
   *  fetch. Shared by the in-page "Regenerate" button and the assistant
   *  `generateGlobalSteep` command — both need the exact same behaviour so
   *  keeping the logic in one place avoids drift. */
  async function regenerateAll() {
    // Clear through the parent so the autosave picks up the empty state too.
    onChange({ S: '', T: '', E: '', ENV: '', P: '' });
    // Force the next fetch to fire even though `sector` hasn't changed.
    fetchedFor.current = null;
    await fetchAll();
  }

  // Register the assistant `generateGlobalSteep` command from inside this
  // component so the handler can actually re-run the fetch. The previous
  // registration in NewReportPage only cleared the textareas — it relied on
  // the auto-fetch effect re-firing, which only depends on `sector` and so
  // never re-fired. Doing it here lets us reset `fetchedFor` and call
  // fetchAll directly. useCommands re-resolves the closure on every render
  // so we don't need a ref to pin regenerateAll.
  useCommands(() => [
    {
      name: 'generateGlobalSteep',
      mode: 'confirm',
      label: () => 'Generar STEEP mundial',
      handler: async () => {
        await regenerateAll();
        return 'Global STEEP regenerated.';
      },
    },
  ]);

  const showContent = !bulkLoading;

  return (
    <div>
      {max.activeKey && (
        <div className="maximize-backdrop" onClick={max.minimize} aria-hidden />
      )}
      <div className="eyebrow">{t('wizard.global.eyebrow')}</div>
      <h1 className="page-title">{t('wizard.global.title')}</h1>
      <p className="page-desc">{t('wizard.global.description')}</p>

      {bulkLoading && (
        <LoadingPanel
          title={t('wizard.global.loadingText')}
          running={bulkLoading}
          items={[
            {
              key: 'search',
              label: t('wizard.global.progressItems.search'),
              status: progressStatus.search,
            },
            {
              key: 'macro',
              label: t('wizard.global.progressItems.macro'),
              status: progressStatus.macro,
            },
            {
              key: 'sector',
              label: t('wizard.global.progressItems.sector'),
              status: progressStatus.sector,
            },
          ] satisfies ProgressItem[]}
        />
      )}

      {showContent && (
        <>
          <div className="callout">
            <div className="callout-icon">
              <svg className="ico" aria-hidden><use href="#i-globe" /></svg>
            </div>
            <span className="callout-text">{t('wizard.global.banner')}</span>
            <button
              type="button"
              className="btn btn-ai callout-action"
              onClick={() => void regenerateAll()}
              disabled={bulkLoading || !sector.trim()}
              title={
                sector.trim()
                  ? t('wizard.global.regenerateTitle')
                  : t('wizard.global.regenerateDisabledTitle')
              }
            >
              {bulkLoading ? <span className="btn-ai-spinner" /> : '✦'}{' '}
              {t('wizard.global.regenerate')}
            </button>
          </div>

          <div className="steep-grid">
            {FIELD_KEYS.map((key, i) => {
              const isFull = i === FIELD_KEYS.length - 1;
              const isMax = max.isMaximized(key);
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
                          {t(`wizard.global.dimensions.${key}`)}
                        </div>
                        <div className="steep-sub">{t(`wizard.global.subs.${key}`)}</div>
                      </div>
                    </div>
                    <div className="card-actions">
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
                    value={data[key]}
                    onChange={(e) => onChange({ ...data, [key]: e.target.value })}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      {error && <div className="err-box">{error}</div>}

      <div className="btn-row">
        <button type="button" className="btn" onClick={onBack} disabled={bulkLoading}>
          {t('wizard.back')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onNext}
          disabled={bulkLoading}
        >
          {t('wizard.global.next')}
        </button>
      </div>
    </div>
  );
}
