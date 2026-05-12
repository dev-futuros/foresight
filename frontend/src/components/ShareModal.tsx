import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { useCreateShare } from '../hooks/useShare';
import { useReport } from '../hooks/useReports';
import { useExample } from '../hooks/useExamples';
import { extractApiErrorMessage } from '../lib/apiError';

interface Props {
  open: boolean;
  reportId: string;
  /** Whether {@code reportId} references a user-owned report or a global
   *  example. Drives which detail endpoint feeds the language picker and
   *  which share-mint endpoint the modal hits. Defaults to {@code 'report'}
   *  so existing callers stay unchanged. */
  kind?: 'report' | 'example';
  onClose: () => void;
}

type Language = 'es' | 'en';

/**
 * Modal that mints a fresh public share link for the current report and lets
 * the owner copy it to the clipboard.
 *
 * <p>Translation is no longer triggered from this dialog — the dashboard now
 * owns the translate workflow and only languages that have already been
 * materialised show up in the picker here. If only the primary language is
 * available the picker is hidden entirely. This keeps share-mint snappy:
 * every call hits a warm cache, no 30-second Anthropic round-trip.
 *
 * <p>Each open OR language change creates a NEW token rather than reusing a
 * previous one — matching the demo behaviour.
 */
export default function ShareModal({ open, reportId, kind = 'report', onClose }: Props) {
  const { t } = useTranslation();
  const createShare = useCreateShare();
  // Pass an empty id to the disabled query so React Query's `enabled`
  // gate bails out without firing a request to the wrong endpoint.
  const reportQuery = useReport(kind === 'report' ? reportId : '');
  const exampleQuery = useExample(kind === 'example' ? reportId : '');
  const data = kind === 'example' ? exampleQuery.data : reportQuery.data;
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState<Language>('es');

  const availableLanguages = useMemo<Language[]>(() => {
    const list = (data?.availableLanguages ?? []) as Language[];
    return list.length > 0 ? list : ['es'];
  }, [data]);

  const primaryLanguage =
    (data?.primaryLanguage as Language | undefined) ?? 'es';

  // Initial language defaults to the source's primary language once the
  // detail row has loaded. Reset on every open.
  useEffect(() => {
    if (open && data) {
      setLanguage(primaryLanguage);
    }
  }, [open, primaryLanguage, data]);

  // Mint (or re-mint) a token whenever the language changes while the
  // modal is open. Translation is guaranteed already-cached because the
  // picker only exposes available languages — share-mint just snapshots
  // the existing translation row.
  useEffect(() => {
    if (open && data) {
      setCopied(false);
      createShare.reset();
      createShare.mutate({ reportId, language, kind });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reportId, language, kind, data]);

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

  const errorMessage = createShare.error
    ? extractApiErrorMessage(createShare.error, t('share.errorDefault'))
    : null;

  const isMinting = createShare.isPending;
  // Hide the picker when only one language is available — there's nothing
  // to pick. The user translates the report from the dashboard first if
  // they want a different language here.
  const showPicker = availableLanguages.length > 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={t('share.title')}
      dialogClassName="modal-dialog--share"
    >
      <div className="share-eyebrow">{t('share.eyebrow')}</div>
      <h2 className="modal-title">{t('share.title')}</h2>

      {showPicker && (
        <div className="share-lang-row">
          <label htmlFor="share-language" className="share-lang-label">
            {t('share.language', { defaultValue: 'Language' })}
          </label>
          <select
            id="share-language"
            className="share-lang-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            disabled={isMinting}
          >
            {availableLanguages.map((lng) => (
              <option key={lng} value={lng}>
                {t(`share.lang.${lng}` as 'share.lang.es' | 'share.lang.en', {
                  defaultValue: lng.toUpperCase(),
                })}
              </option>
            ))}
          </select>
        </div>
      )}

      {isMinting && (
        <div className="share-stage">{t('share.generating')}</div>
      )}

      {createShare.data && !isMinting && (
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
