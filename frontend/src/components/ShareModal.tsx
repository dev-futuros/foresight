import type { LanguageCode } from '../i18n/languages';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { useCreateShare } from '../features/publicShare/api';
import { useReport } from '../features/report/api';
import { useExample } from '../features/examples/api';
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

type Language = LanguageCode;

/**
 * Modal that mints a fresh public share link for the current report and lets
 * the owner copy it to the clipboard.
 *
 * <p>Two language controls when the source has more than one cached
 * language:
 *
 * <ul>
 *   <li><b>Include</b> — checkboxes for each language the source has.
 *       Selected ones get baked into the share snapshot; unselected
 *       are stripped, so the recipient can't switch to them. The
 *       chosen default-open language is always implicitly included
 *       (you can't share something without its default).</li>
 *   <li><b>Default language</b> — which language the share viewer
 *       opens in first. Recipients can still switch in-page among
 *       the included languages via the share viewer's pill.</li>
 * </ul>
 *
 * <p>With just one available language both controls hide; the share is
 * single-language by definition.
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
  const [includedLanguages, setIncludedLanguages] = useState<Language[]>([]);

  const availableLanguages = useMemo<Language[]>(() => {
    const list = (data?.availableLanguages ?? []) as Language[];
    return list.length > 0 ? list : ['es'];
  }, [data]);

  const primaryLanguage = (data?.primaryLanguage) ?? 'es';

  // Hide both controls when there's nothing to pick.
  const showLangControls = availableLanguages.length > 1;

  // On open: reset the default-language picker to the source's primary
  // and pre-check every available language. Most users want to share
  // everything they've translated; opting OUT is the rare path.
  useEffect(() => {
    if (open && data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset-on-open: snap pickers back to the row's defaults whenever the modal opens
      setLanguage(primaryLanguage);
      setIncludedLanguages([...availableLanguages]);
    }
  }, [open, primaryLanguage, data, availableLanguages]);

  // The default-open language MUST be one of the included ones. If
  // the user unchecks the currently-default, fall back to the first
  // still-included language (deterministic — picks the leftmost
  // checkbox that survives).
  useEffect(() => {
    if (includedLanguages.length === 0) return;
    if (!includedLanguages.includes(language)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clamp default to a still-included language; cannot be derived during render because it would feed back into its own deps
      setLanguage(includedLanguages[0]);
    }
  }, [includedLanguages, language]);

  // Single debounced effect that handles BOTH the initial mint and
  // any subsequent re-mint triggered by checkbox / default-language
  // changes. ~400ms gives the user time to flip several checkboxes
  // before we fire a single mint with the final state, and the
  // previously-minted URL (when one exists) stays visible during the
  // edit so the row doesn't flicker. The 400ms wait on FIRST open is
  // perceptually fine — the mutation itself usually takes longer.
  useEffect(() => {
    if (!open || !data || includedLanguages.length === 0) return;
    const handle = window.setTimeout(() => {
      setCopied(false);
      createShare.mutate({ reportId, language, languages: includedLanguages, kind });
    }, 400);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data, reportId, kind, language, includedLanguages]);

  // Reset the mutation state when the modal closes so reopening for a
  // different report doesn't briefly show the old URL.
  useEffect(() => {
    if (!open) {
      createShare.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset copied flag when modal closes so reopening for a different row doesn't briefly show the old "copied!" state
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * Toggle a language's inclusion. Guards against unchecking the
   * currently-selected default in a way that leaves zero languages
   * checked (the share endpoint requires at least one).
   */
  function toggleLanguage(lng: Language) {
    setIncludedLanguages((prev) => {
      const isIncluded = prev.includes(lng);
      if (isIncluded) {
        // Last one standing — can't share zero languages.
        if (prev.length === 1) return prev;
        return prev.filter((l) => l !== lng);
      }
      return [...prev, lng];
    });
  }

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

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={t('share.title')}
      dialogClassName="modal-dialog--share"
    >
      <div className="share-eyebrow">{t('share.eyebrow')}</div>
      <h2 className="modal-title">{t('share.title')}</h2>

      {showLangControls && (
        <>
          <div className="share-lang-row share-lang-row--checks">
            <span className="share-lang-label">
              {t('share.includeLanguages', { defaultValue: 'Include languages' })}
            </span>
            <div className="share-lang-checks">
              {availableLanguages.map((lng) => {
                const checked = includedLanguages.includes(lng);
                // The last-remaining checked option becomes
                // un-uncheckable so we never end up requesting a share
                // with zero languages. Disabling the input gives a
                // clear visual cue.
                const lastChecked = checked && includedLanguages.length === 1;
                return (
                  <label key={lng} className={`share-lang-check${checked ? ' is-checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isMinting || lastChecked}
                      onChange={() => toggleLanguage(lng)}
                    />
                    <span>
                      {t(`share.lang.${lng}`, {
                        defaultValue: lng.toUpperCase(),
                      })}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="share-lang-row">
            <label htmlFor="share-default-language" className="share-lang-label">
              {t('share.defaultLanguage', { defaultValue: 'Default language' })}
            </label>
            <select
              id="share-default-language"
              className="share-lang-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              disabled={isMinting}
            >
              {includedLanguages.map((lng) => (
                <option key={lng} value={lng}>
                  {t(`share.lang.${lng}`, {
                    defaultValue: lng.toUpperCase(),
                  })}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Always render the URL row so toggling checkboxes doesn't
          unmount/remount the input — the field stays in place and just
          swaps its value when a new mint resolves. While a mint is in
          flight (initial load OR after a checkbox change debounce
          fires), the input shows a placeholder hint and the Copy
          button is greyed out. */}
      <div className="share-url-row">
        <input
          type="text"
          readOnly
          value={createShare.data?.shareUrl ?? ''}
          placeholder={isMinting ? t('share.generating') : ''}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t('share.urlLabel')}
          aria-busy={isMinting || undefined}
        />
        <button
          type="button"
          className={`share-copy-btn${copied ? ' share-copy-btn--ok' : ''}`}
          onClick={handleCopy}
          disabled={!createShare.data || isMinting}
          aria-label={copied ? t('share.copied') : t('share.copy')}
          title={copied ? t('share.copied') : t('share.copy')}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <use href={copied ? '#i-check' : '#i-link'} />
          </svg>
        </button>
      </div>
      <p className="share-meta">{t('share.expires')}</p>

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
