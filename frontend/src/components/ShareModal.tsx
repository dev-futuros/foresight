import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { useCreateShare } from '../hooks/useShare';
import { useReport, translateReportStream, type TranslateProgress } from '../hooks/useReports';
import { extractApiErrorMessage } from '../lib/apiError';

interface Props {
  open: boolean;
  reportId: string;
  onClose: () => void;
}

type Language = 'es' | 'en';

/**
 * Modal that mints a fresh public share link for the current report and lets
 * the owner copy it to the clipboard. Mirrors the demo's `share-modal` flow:
 *
 * 1. Open → primary language is pre-selected and a link minted immediately.
 * 2. User can pick another language from the dropdown — if that language
 *    isn't yet translated on the backend, the modal first streams a
 *    translation (rendering a determinate progress bar based on
 *    {@code outputChars / inputChars}) and then mints the share link.
 * 3. Success → URL field readonly + Copy button + 7-day expiry note.
 * 4. Error → inline error box.
 *
 * Each open OR language change creates a NEW token rather than reusing a
 * previous one — matching the demo behaviour.
 */
export default function ShareModal({ open, reportId, onClose }: Props) {
  const { t } = useTranslation();
  const createShare = useCreateShare();
  const reportQuery = useReport(reportId);
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState<Language>('es');

  // Translation streaming state. {@code progress} is null until the
  // first SSE frame lands; we render the indeterminate "Preparing…"
  // copy in that window so the bar doesn't snap from 0 → 80% on the
  // first tick.
  const [progress, setProgress] = useState<TranslateProgress | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  // Tracks the in-flight stream so a language change mid-flight cancels
  // the previous fetch instead of double-translating.
  const abortRef = useRef<AbortController | null>(null);

  // Initial language defaults to the report's primary language once the
  // detail row has loaded. Reset on every open.
  useEffect(() => {
    if (open && reportQuery.data) {
      setLanguage(
        (reportQuery.data.primaryLanguage as Language | undefined) ?? 'es',
      );
    }
  }, [open, reportQuery.data]);

  // Cleanup on unmount: cancel any in-flight stream.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const availableLanguages = useMemo<Language[]>(() => {
    const list = (reportQuery.data?.availableLanguages ?? []) as Language[];
    return list.length > 0 ? list : ['es'];
  }, [reportQuery.data]);

  const primaryLanguage = (reportQuery.data?.primaryLanguage as Language | undefined) ?? 'es';

  /**
   * Run the full "translate (if needed) → mint share link" sequence for
   * the currently-selected language. Wrapped in useCallback so the effect
   * dep array stays stable.
   */
  const startFlow = useCallback(
    async (lang: Language) => {
      // Cancel any prior in-flight stream — language might have changed
      // before the previous one resolved.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setCopied(false);
      setTranslateError(null);
      setProgress(null);
      createShare.reset();

      // If translation is needed, stream it first so the user sees a
      // progress bar. Otherwise skip straight to the share mint.
      if (lang !== primaryLanguage && !availableLanguages.includes(lang)) {
        setIsTranslating(true);
        try {
          await translateReportStream({
            id: reportId,
            targetLanguage: lang,
            onProgress: (p) => setProgress(p),
            signal: controller.signal,
          });
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') return;
          setIsTranslating(false);
          setTranslateError(
            (err as Error)?.message ?? t('share.errorDefault'),
          );
          return;
        }
        setIsTranslating(false);
      }

      if (controller.signal.aborted) return;
      createShare.mutate({ reportId, language: lang });
    },
    // We intentionally exclude createShare from the dep array — the mutation
    // hook identity changes on every render but is functionally stable here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportId, primaryLanguage, availableLanguages, t],
  );

  // Auto-mint on open and whenever the chosen language changes.
  useEffect(() => {
    if (open && reportQuery.data) {
      void startFlow(language);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reportId, language, reportQuery.data]);

  async function handleCopy() {
    if (!createShare.data) return;
    try {
      await navigator.clipboard.writeText(createShare.data.shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can fail in insecure contexts (http://) or when the user
      // denies permission. Falling back to manual selection: the input is
      // readonly so the user can still copy by hand.
    }
  }

  const errorMessage =
    translateError ??
    (createShare.error
      ? extractApiErrorMessage(createShare.error, t('share.errorDefault'))
      : null);

  const isMinting = createShare.isPending;
  const isBusy = isTranslating || isMinting;

  // Determinate progress percentage. The translated envelope is roughly
  // the same length as the source, so {@code outputChars / inputChars}
  // is a sensible 0..1 proxy. Cap at 99 so the bar doesn't sit at 100
  // while we wait for the `done` frame + share mint round-trip.
  const progressPct = useMemo(() => {
    if (!progress || progress.inputChars <= 0) return 0;
    const raw = (progress.outputChars / progress.inputChars) * 100;
    return Math.max(2, Math.min(99, Math.round(raw)));
  }, [progress]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={t('share.title')}
      dialogClassName="modal-dialog--share"
    >
      <div className="share-eyebrow">{t('share.eyebrow')}</div>
      <h2 className="modal-title">{t('share.title')}</h2>

      <div className="share-lang-row">
        <label htmlFor="share-language" className="share-lang-label">
          {t('share.language', { defaultValue: 'Language' })}
        </label>
        <select
          id="share-language"
          className="share-lang-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
          disabled={isBusy}
        >
          <option value="es">{t('share.lang.es', { defaultValue: 'Spanish' })}</option>
          <option value="en">{t('share.lang.en', { defaultValue: 'English' })}</option>
        </select>
      </div>

      {isTranslating && (
        <div className="share-translate">
          <div className="share-translate-label">
            {progress
              ? t('share.translating', { defaultValue: 'Translating report…' })
              : t('share.translatingPreparing', {
                  defaultValue: 'Preparing translation…',
                })}
          </div>
          <div
            className="share-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
          >
            <div
              className="share-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {progress && (
            <div className="share-translate-meta">
              {progress.outputChars.toLocaleString()} /{' '}
              {progress.inputChars.toLocaleString()}{' '}
              {t('share.chars', { defaultValue: 'chars' })} ({progressPct}%)
            </div>
          )}
        </div>
      )}

      {isMinting && !isTranslating && (
        <div className="share-stage">{t('share.generating')}</div>
      )}

      {createShare.data && !isBusy && (
        <>
          <div className="share-url-row">
            <input
              type="text"
              readOnly
              value={createShare.data.shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={t('share.urlLabel')}
            />
            <button
              type="button"
              className="modal-btn modal-btn--primary"
              onClick={handleCopy}
            >
              {copied ? t('share.copied') : t('share.copy')}
            </button>
          </div>
          <p className="share-meta">{t('share.expires')}</p>
        </>
      )}

      {errorMessage && (
        <div className="err-box" role="alert">
          {errorMessage}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="modal-btn" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </Modal>
  );
}

