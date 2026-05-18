import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { globalSteepDim, globalSteepScan } from '../api';
import type { GlobalSteep, SourceItem } from '../../../types/api';
import { extractApiErrorMessage } from '../../../lib/apiError';
import { notifyAssistant } from '../../../lib/assistantBridge';
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
  language: 'es' | 'en' | 'ca';
  onChange: (data: GlobalSteepData) => void;
  /**
   * Optional sink for the web_search citations harvested during the scan.
   * NewReportPage holds them in transient state until the user runs the
   * full analysis, at which point they're saved into
   * {@code resultData.sources.globalSteep} so the Sources tab can show a
   * dedicated "Global context (Step 2)" bucket alongside the report-level
   * research citations.
   */
  onCitations?: (citations: SourceItem[]) => void;
  /**
   * Sector for which the auto-fetch has already been attempted in this
   * wizard session. Owned by the parent (NewReportPage) so it survives
   * StepGlobal's mount/unmount cycle when the user navigates between
   * steps. Without this lift, a user who landed on step 2, generated,
   * then navigated to step 3 and back would get an unwanted re-trigger
   * if the fields happened to be empty (e.g. cleared by the assistant
   * or a failed prior attempt).
   */
  fetchedForRef: MutableRefObject<string | null>;
  onNext: () => void;
  onBack: () => void;
  /**
   * When true (wizard is loaded against a global example), every AI
   * round-trip on this step is short-circuited — the auto-fetch effect
   * won't fire, the assistant {@code generateGlobalSteep} command
   * resolves to a friendly no-op. The user can still read and edit the
   * pre-populated dimension textareas locally; changes aren't persisted
   * either way (NewReportPage's persistDraft also short-circuits in
   * example mode).
   */
  disableGenerate?: boolean;
}

/** Maps STEEP field keys to (a) the icon-sprite symbol id and (b) the
 *  dim-icon / steep-dim class modifier, both defined in wizard.css. */
const DIM_META: Record<FieldKey, { icon: string; modifier: string }> = {
  S: { icon: 'i-s', modifier: 's' },
  T: { icon: 'i-t', modifier: 't' },
  E: { icon: 'i-e', modifier: 'e' },
  ENV: { icon: 'i-env', modifier: 'env' },
  P: { icon: 'i-p', modifier: 'p' },
};

/** Keys for the 6 progress rows shown in the loader: a single upstream
 *  scan, then one per STEEP dimension. */
type ProgressKey = 'scan' | FieldKey;

export default function StepGlobal({
  data,
  sector,
  language,
  onChange,
  onCitations,
  fetchedForRef,
  onNext,
  onBack,
  disableGenerate = false,
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
  // Per-row live metric. `scan` uses web_search → we surface both the
  // source count AND the streamed character count so the row keeps
  // showing forward motion after web_search stops adding URLs but the
  // model is still writing out the bullets. The 5 dimension
  // reformulations are pure prose with no search → chars are the only
  // available signal. Updated in real time from each call's onProgress
  // SSE callback.
  const [scanSources, setScanSources] = useState(0);
  const [scanChars, setScanChars] = useState(0);
  const [dimChars, setDimChars] = useState<Record<FieldKey, number>>({
    S: 0,
    T: 0,
    E: 0,
    ENV: 0,
    P: 0,
  });
  const [error, setError] = useState<string | null>(null);
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
    setScanSources(0);
    setScanChars(0);
    setDimChars({ S: 0, T: 0, E: 0, ENV: 0, P: 0 });
    try {
      // ── Phase 1 — scan ──
      // Streamed: onProgress fires as Anthropic returns new web_search
      // results. The scan row's "sources consulted" counter ticks live.
      // The scan's citations are bubbled up via onCitations so the
      // parent can save them into resultData.sources.globalSteep when
      // the full analysis runs — that's what surfaces the "Global
      // context (Step 2)" bucket in the report's Sources tab.
      const { result: scan, citations: scanCitations } = await globalSteepScan(
        { sector, language },
        (p) => {
          // Both counters tick during the scan — sources climb while
          // web_search runs, chars climb while the model writes out
          // the dated bullets.
          setScanSources((prev) => (prev === p.sources ? prev : p.sources));
          setScanChars((prev) => (prev === p.chars ? prev : p.chars));
        },
      );
      onCitations?.(scanCitations);
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
      // Each dim streams plain prose (no web_search). The onProgress
      // callback's `chars` is the accumulated character count so far —
      // that drives the per-row metric. Results merge into a local
      // mirror so we can issue ONE final onChange with the whole batch
      // (avoids 5 intermediate parent re-renders that would clobber each
      // other's autosave). Each dim still flips its progress row
      // independently as it resolves.
      const merged: GlobalSteepData = { S: '', T: '', E: '', ENV: '', P: '' };
      await Promise.allSettled(
        FIELD_KEYS.map(async (key) => {
          try {
            const text = await globalSteepDim(
              {
                sector,
                language,
                dimension: key,
                snippet: scan[key] ?? '',
              },
              (p) =>
                setDimChars((prev) => (prev[key] === p.chars ? prev : { ...prev, [key]: p.chars })),
            );
            merged[key] = text;
            setProgress((p) => ({ ...p, [key]: 'done' }));
          } catch (e) {
            setProgress((p) => ({ ...p, [key]: 'error' }));
            throw e;
          }
        }),
      );
      onChange(merged);
      // Nudge the assistant — once the dimensions are visible, the chat
      // can proactively offer to walk through them, refine any that feel
      // off, or move on to step 3. Deferred via setTimeout so React has
      // time to commit the new globalData, the parent's AssistantContext
      // useEffect re-runs, and the chat's snapshotRef picks up the new
      // user-state block BEFORE the API call fires. Without this delay
      // the model sees stale "(empty)" values for the five dimensions
      // and gives a confused response. The bridge no-ops when the chat
      // has never been opened or when a turn is already in flight, so
      // this is safe to fire unconditionally on every successful
      // generation.
      setTimeout(() => {
        notifyAssistant(
          '[STATE CHANGE: Global STEEP generation just finished. The five dimensions (Social, Technological, Economic, Environmental, Political) are now populated and visible to the user — check the user-state block in your system prompt for the actual content. Acknowledge it briefly, offer to walk through them, refine any that feel off, or move on to step 3 (Sectorial STEEP). Keep it short — 2-3 sentences max. Do NOT emit any <command> tags.]',
        );
      }, 50);
    } catch (e) {
      setError(extractApiErrorMessage(e, t('wizard.global.errorDefault')));
      // Deliberately NOT resetting fetchedForRef.current — once auto-fetch
      // has been attempted for a sector (success or failure), we don't
      // want a re-mount of step 2 (e.g. navigating away and back) to
      // re-trigger the call. User can retry via the assistant's
      // generateGlobalSteep command, which calls regenerateAll() and
      // resets the ref explicitly.
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
    // Examples are read-only — never auto-fetch even if the dimension
    // textareas happen to be empty. Spending AI budget on content that
    // won't persist would be wasteful, and the user shouldn't be
    // surprised by a generation kicking off when they're just
    // exploring.
    if (disableGenerate) return;
    if (!hasAny && sector.trim() && fetchedForRef.current !== sector) {
      // Claim this sector synchronously BEFORE the async fetch starts. React 18 StrictMode
      // double-mounts effects in dev, so the second pass would otherwise see the ref still
      // null and fire a duplicate request (wasting an Anthropic call). On error we reset
      // the ref so the next render can retry.
      fetchedForRef.current = sector;
      void fetchAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sector, disableGenerate]);

  /** Wipes the textareas, resets the fetched-for guard, and forces a fresh
   *  fetch. Shared by the in-page "Regenerate" button and the assistant
   *  `generateGlobalSteep` command — both need the exact same behaviour so
   *  keeping the logic in one place avoids drift. */
  async function regenerateAll() {
    // Example mode: refuse silently. The assistant command is wired to
    // this function regardless of mode; gating here means an assistant
    // turn that emits generateGlobalSteep on an example doesn't spend
    // AI budget on read-only content.
    if (disableGenerate) return;
    // Clear through the parent so the autosave picks up the empty state too.
    onChange({ S: '', T: '', E: '', ENV: '', P: '' });
    // Force the next fetch to fire even though `sector` hasn't changed.
    fetchedForRef.current = null;
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
  // they translate with the rest of the wizard. The scan row reports
  // BOTH live source count and streamed chars (web_search row); the
  // dim rows report accumulated character count only (no web_search,
  // prose only).
  const loadingItems: ProgressItem[] = [
    {
      key: 'scan',
      label: t('wizard.global.progressItems.scan'),
      status: progress.scan,
      metric: { sources: scanSources, chars: scanChars },
    },
    ...FIELD_KEYS.map(
      (key): ProgressItem => ({
        key,
        label: t(`wizard.global.dimensions.${key}`),
        status: progress[key],
        metric: { chars: dimChars[key] },
      }),
    ),
  ];

  return (
    <div>
      {max.activeKey && <div className="maximize-backdrop" onClick={max.minimize} aria-hidden />}

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
                    /* id matches the setField target id (gs-s, gs-t, gs-e,
                       gs-env, gs-p) so the gold flash in NewReportPage's
                       setField handler can find this element. */
                    id={`gs-${key.toLowerCase()}`}
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
          <button type="button" className="btn btn-primary" onClick={onNext} disabled={bulkLoading}>
            {t('wizard.global.next')}
          </button>
        </div>
      )}
    </div>
  );
}
