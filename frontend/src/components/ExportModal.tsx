import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { useReport } from '../hooks/useReports';
import { useExample } from '../hooks/useExamples';

export type ExportLanguage = 'es' | 'en';
export type ExportFormat = 'pdf' | 'ppt';

interface Props {
  open: boolean;
  reportId: string;
  onClose: () => void;
  /**
   * Whether {@code reportId} references a user-owned report or a global
   * example. Drives which detail endpoint feeds the language picker.
   * Defaults to {@code 'report'} so existing callers keep working.
   */
  kind?: 'report' | 'example';
  /**
   * Fires when the user clicks Export. The parent owns the heavy
   * jsPDF / pptxgenjs work and the LoadingOverlay that runs alongside
   * it — the modal closes itself immediately after the callback so
   * the user's eyes go straight to the export overlay.
   */
  onExport: (format: ExportFormat, language: ExportLanguage) => void;
  /** Pre-select a format on open. The user can still change it. Used
   *  by the assistant when it knows the format but not the language. */
  initialFormat?: ExportFormat;
  /** Pre-select a language on open (must be in the report's
   *  availableLanguages, otherwise it's silently ignored and the
   *  primary language wins). */
  initialLanguage?: ExportLanguage;
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
export default function ExportModal({
  open,
  reportId,
  kind = 'report',
  onClose,
  onExport,
  initialFormat,
  initialLanguage,
}: Props) {
  const { t } = useTranslation();
  // Hooks must be called unconditionally; pass an empty id to the
  // disabled side so React Query bails out via the `enabled: !!id` gate.
  const reportQuery = useReport(kind === 'report' ? reportId : '');
  const exampleQuery = useExample(kind === 'example' ? reportId : '');
  const data = kind === 'example' ? exampleQuery.data : reportQuery.data;
  const isLoading = kind === 'example' ? exampleQuery.isLoading : reportQuery.isLoading;

  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [language, setLanguage] = useState<ExportLanguage>('es');

  const availableLanguages = useMemo<ExportLanguage[]>(() => {
    const list = (data?.availableLanguages ?? []) as ExportLanguage[];
    return list.length > 0 ? list : ['es'];
  }, [data]);

  const primaryLanguage =
    (data?.primaryLanguage as ExportLanguage | undefined) ?? 'es';

  // Snap the language pick back to the row's primary on every open
  // so reopening the modal doesn't carry over a stale selection from a
  // previous row. {@code initialFormat} / {@code initialLanguage} let
  // the assistant pre-fill what it knows; the user can still change
  // either field before clicking Export.
  useEffect(() => {
    if (open && data) {
      const wantedLang =
        initialLanguage && availableLanguages.includes(initialLanguage)
          ? initialLanguage
          : primaryLanguage;
      setLanguage(wantedLang);
      setFormat(initialFormat ?? 'pdf');
    }
  }, [open, primaryLanguage, data, initialFormat, initialLanguage, availableLanguages]);

  function handleExport() {
    onExport(format, language);
    onClose();
  }

  const showLangPicker = availableLanguages.length > 1;

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
