import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  globalSteepDim,
  globalSteepScan,
  type GlobalSteep,
  type GlobalSteepDimension,
} from '../../../lib/aiClient';
import { extractApiErrorMessage } from '../../../lib/apiError';
import { useMaximizable } from '../../../components/useMaximizable';
import LoadingPanel, {
  type ProgressItem,
  type ProgressItemStatus,
} from '../../../components/LoadingPanel';
import Modal from '../../../components/Modal';
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

/** Keys for the 6 progress rows shown in the loader: a single upstream
 *  scan, then one per STEEP dimension. */
type ProgressKey = 'scan' | FieldKey;

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
  const [progress, setProgress] = useState<Record<ProgressKey, ProgressItemStatus>>({
    scan: 'pending',
    S: 'pending',
    T: 'pending',
    E: 'pending',
    ENV: 'pending',
    P: 'pending',
  });
  const [error, setError] = useState<string | null>(null);
  const fetchedFor = useRef<string | null>(null);
  const max = useMaximizable<FieldKey>();

  const hasAny = FIELD_KEYS.some((k) => data[k].trim());

  /**
   * Two-phase fetch:
   *   1. Single web-search scan → JSON of raw dated bullets for all 5 dims.
   *   2. Five parallel reformulations (one per dim), each fed the matching
   *      snippet from the scan. Each dim's textarea fills in as its call
   *      resolves; an individual failure doesn't take down the others
   *      (Promise.allSettled), so a partial result is better than nothing.
   */
  async function fetchAll() {
    if (!sector.trim()) return;
    setBulkLoading(true);
    setError(null);
    setProgress({
      scan: 'running',
      S: 'pending',
      T: 'pending',
      E: 'pending',
      ENV: 'pending',
      P: 'pending',
    });
    try {
      // ── Phase 1 — scan ──
      const scan = await globalSteepScan({ sector, language });
      setProgress((p) => ({
        ...p,
        scan: 'done',
        S: 'running',
        T: 'running',
        E: 'running',
        ENV: 'running',
        P: 'running',
      }));

      // ── Phase 2 — 5 parallel dim reformulations ──
      // Accumulate results into a local mirror so we can issue ONE final
      // onChange with the whole batch (avoids 5 intermediate parent re-
      // renders that would clobber each other's autosave). Each dim still
      // flips its progress row independently as it resolves.
      const merged: GlobalSteepData = { S: '', T: '', E: '', ENV: '', P: '' };
      await Promise.allSettled(
        FIELD_KEYS.map(async (key) => {
          try {
            const text = await globalSteepDim({
              sector,
              language,
              dimension: key as GlobalSteepDimension,
              snippet: scan[key] ?? '',
            });
            merged[key] = text;
            setProgress((p) => ({ ...p, [key]: 'done' }));
          } catch (e) {
            setProgress((p) => ({ ...p, [key]: 'error' }));
            throw e;
          }
        }),
      );
      onChange(merged);
    } catch (e) {
      setError(extractApiErrorMessage(e, t('wizard.global.errorDefault')));
      fetchedFor.current = null;
      // Mark whichever rows are still pending as errored so the user
      // sees they didn't complete (vs being left as the running spinner).
      setProgress((p) => {
        const next = { ...p };
        (Object.keys(next) as ProgressKey[]).forEach((k) => {
          if (next[k] === 'running' || next[k] === 'pending') next[k] = 'error';
        });
        return next;
      });
    } finally {
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
  // component so the handler can actually re-run the fetch. useCommands
  // re-resolves the closure on every render so we don't need a ref to
  // pin regenerateAll.
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

  // Loader checklist — 1 scan row + 5 dim rows. Labels live in i18n so
  // they translate with the rest of the wizard.
  const loadingItems: ProgressItem[] = [
    {
      key: 'scan',
      label: t('wizard.global.progressItems.scan'),
      status: progress.scan,
    },
    ...FIELD_KEYS.map((key): ProgressItem => ({
      key,
      label: t(`wizard.global.dimensions.${key}`),
      status: progress[key],
    })),
  ];

  return (
    <div>
      {max.activeKey && (
        <div className="maximize-backdrop" onClick={max.minimize} aria-hidden />
      )}

      {/* Header + grid are mutually exclusive with the loader. Wrapping
          both in showContent keeps the loader truly full-screen-of-step
          rather than competing with the step title for vertical space. */}
      {showContent && (
        <>
          <div className="eyebrow">{t('wizard.global.eyebrow')}</div>
          <h1 className="page-title">{t('wizard.global.title')}</h1>
          <p className="page-desc">{t('wizard.global.description')}</p>
        </>
      )}

      {/* Full-screen Modal overlay so the loader covers topbar, stepper,
          footer and chat — nothing else is interactive while the scan +
          5 parallel dim calls are in flight. The Modal portals to body
          and locks body scroll via the shared refcount in Modal.tsx. */}
      <Modal
        open={bulkLoading}
        onClose={() => undefined}
        variant="fullscreen"
        ariaLabel={t('wizard.global.loadingText')}
      >
        <LoadingPanel
          title={t('wizard.global.loadingText')}
          running={bulkLoading}
          items={loadingItems}
        />
      </Modal>

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

      {showContent && (
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
      )}
    </div>
  );
}
