import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { useReport } from '../hooks/useReports';

export type ExportLanguage = 'es' | 'en';
export type ExportFormat = 'pdf' | 'ppt';

interface Props {
  open: boolean;
  reportId: string;
  onClose: () => void;
  /**
   * Fires when the user clicks Export. The parent owns the heavy
   * jsPDF / pptxgenjs work and the LoadingOverlay that runs alongside
   * it — the modal closes itself immediately after the callback so
   * the user's eyes go straight to the export overlay.
   */
  onExport: (format: ExportFormat, language: ExportLanguage) => void;
}

/**
 * Modal that lets the report owner pick an export format (PDF / PPT)
 * and a language for the generated file. Mirrors {@link ShareModal} so
 * both flows feel consistent — same eyebrow, same picker layout, same
 * primary-action button.
 *
 * <p>The language picker only lists languages that are already
 * materialised on the report (its primary language plus any cached
 * translations). When only one language is available the picker is
 * hidden entirely — translation is the dashboard's job, not this
 * modal's. Hitting Export with a translation language triggers a
 * cache-hit fetch on the parent side, never an Anthropic round-trip.
 */
export default function ExportModal({ open, reportId, onClose, onExport }: Props) {
  const { t } = useTranslation();
  const reportQuery = useReport(reportId);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [language, setLanguage] = useState<ExportLanguage>('es');

  const availableLanguages = useMemo<ExportLanguage[]>(() => {
    const list = (reportQuery.data?.availableLanguages ?? []) as ExportLanguage[];
    return list.length > 0 ? list : ['es'];
  }, [reportQuery.data]);

  const primaryLanguage =
    (reportQuery.data?.primaryLanguage as ExportLanguage | undefined) ?? 'es';

  // Snap the language pick back to the report's primary on every open
  // so reopening the modal doesn't carry over a stale selection from a
  // previous report row.
  useEffect(() => {
    if (open && reportQuery.data) {
      setLanguage(primaryLanguage);
      setFormat('pdf');
    }
  }, [open, primaryLanguage, reportQuery.data]);

  function handleExport() {
    onExport(format, language);
    onClose();
  }

  const showLangPicker = availableLanguages.length > 1;
  const isLoading = reportQuery.isLoading;

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={t('exportModal.title', { defaultValue: 'Export report' })}
      dialogClassName="modal-dialog--share"
    >
      <div className="share-eyebrow">
        {t('exportModal.eyebrow', { defaultValue: 'Export' })}
      </div>
      <h2 className="modal-title">
        {t('exportModal.title', { defaultValue: 'Export report' })}
      </h2>

      <div className="share-lang-row">
        <label htmlFor="export-format" className="share-lang-label">
          {t('exportModal.format', { defaultValue: 'Format' })}
        </label>
        <select
          id="export-format"
          className="share-lang-select"
          value={format}
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
          disabled={isLoading}
        >
          <option value="pdf">
            {t('exportModal.formats.pdf', { defaultValue: 'PDF — Printable document' })}
          </option>
          <option value="ppt">
            {t('exportModal.formats.ppt', { defaultValue: 'PowerPoint — Editable slides' })}
          </option>
        </select>
      </div>

      {showLangPicker && (
        <div className="share-lang-row">
          <label htmlFor="export-language" className="share-lang-label">
            {t('share.language', { defaultValue: 'Language' })}
          </label>
          <select
            id="export-language"
            className="share-lang-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as ExportLanguage)}
            disabled={isLoading}
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

      <div className="modal-actions">
        <button type="button" className="modal-btn" onClick={onClose}>
          {t('common.close')}
        </button>
        <button
          type="button"
          className="modal-btn modal-btn--primary"
          onClick={handleExport}
          disabled={isLoading}
        >
          {t('exportModal.action', { defaultValue: 'Export' })}
        </button>
      </div>
    </Modal>
  );
}
