import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { useCreateShare } from '../hooks/useShare';
import { extractApiErrorMessage } from '../lib/apiError';

interface Props {
  open: boolean;
  reportId: string;
  onClose: () => void;
}

/**
 * Modal that mints a fresh public share link for the current report and lets
 * the owner copy it to the clipboard. Mirrors the demo's `share-modal` flow:
 *
 * 1. Open → "Generating link…" stage while the POST is in flight.
 * 2. Success → URL field readonly + "Copy" button + 7-day expiry note.
 * 3. Error → inline error box, button to retry.
 *
 * Each open creates a NEW token rather than reusing a previous one, matching
 * the demo behaviour. Reusing would require listing existing shares and is
 * out of scope for this iteration.
 */
export default function ShareModal({ open, reportId, onClose }: Props) {
  const { t } = useTranslation();
  const createShare = useCreateShare();
  const [copied, setCopied] = useState(false);

  // Mint a fresh token every time the modal opens. The unconditional reset on
  // close is what lets the next open start clean — without it the previous URL
  // would flash for an instant before the new POST completes.
  useEffect(() => {
    if (open) {
      setCopied(false);
      createShare.reset();
      createShare.mutate(reportId);
    }
    // We deliberately omit createShare from the dep list — referencing it would
    // re-fire the mutation on every render. The mutation hook is stable enough
    // for this single-shot pattern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reportId]);

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

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={t('share.title')}
      dialogClassName="modal-dialog--share"
    >
      <div className="share-eyebrow">{t('share.eyebrow')}</div>
      <h2 className="modal-title">{t('share.title')}</h2>

      {createShare.isPending && (
        <div className="share-stage">{t('share.generating')}</div>
      )}

      {createShare.data && (
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
