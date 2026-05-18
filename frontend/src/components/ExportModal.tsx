import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { useReport } from '../features/report/api';
import { useExample } from '../features/examples/api';
import { useIsDev } from '../features/account/api';

export type ExportLanguage = 'es' | 'en' | 'ca';
/**
 * The {@code 'html'} option is gated to DEV users in the picker UI
 * (see {@link useIsDev}); the type stays open so the exporter can be
 * wired without conditional generic juggling. Callers that aren't DEV
 * will simply never receive {@code 'html'} from the modal.
 */
export type ExportFormat = 'pdf' | 'ppt' | 'html';
/**
 * Colour scheme for the PDF export. {@code 'dark'} mirrors the on-screen
 * dark editorial palette (default); {@code 'light'} swaps to a printer-friendly
 * palette with a white background and darker accent colours. Only used by the
 * PDF format — PPT and HTML ignore the selection.
 */
export type ExportPdfTheme = 'dark' | 'light';

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
   *
   * <p>{@code includeLanguages} is only populated for HTML exports —
   * it's the set of languages the standalone snapshot should bake in.
   * For PDF/PPT it's {@code undefined} (those formats are
   * single-language and use the {@code language} arg as the content
   * filter directly).
   */
  onExport: (
    format: ExportFormat,
    language: ExportLanguage,
    includeLanguages?: ExportLanguage[],
    /** PDF colour scheme. Ignored for non-PDF formats. */
    pdfTheme?: ExportPdfTheme,
  ) => void;
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
  // DEV-only HTML export — the picker hides the option for non-DEVs so a
  // production user never accidentally downloads a standalone HTML page.
  const isDev = useIsDev();
  // Hooks must be called unconditionally; pass an empty id to the
  // disabled side so React Query bails out via the `enabled: !!id` gate.
  const reportQuery = useReport(kind === 'report' ? reportId : '');
  const exampleQuery = useExample(kind === 'example' ? reportId : '');
  const data = kind === 'example' ? exampleQuery.data : reportQuery.data;
  const isLoading = kind === 'example' ? exampleQuery.isLoading : reportQuery.isLoading;

  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [language, setLanguage] = useState<ExportLanguage>('es');
  // PDF colour scheme. Dark mirrors the editorial on-screen palette; light is
  // print-friendly (white background, darker accent colours). Only used when
  // format === 'pdf'; PPT and HTML ignore this picker.
  const [pdfTheme, setPdfTheme] = useState<ExportPdfTheme>('dark');
  // For HTML exports the standalone bakes the selected languages —
  // the "language" picker above is decorative (greyed). This separate
  // picker controls which language the snapshot OPENS in when the
  // recipient first loads it; they can still toggle via the in-page
  // switcher. Only used when format=html.
  const [htmlDefaultLanguage, setHtmlDefaultLanguage] = useState<ExportLanguage>('es');
  // Which languages get baked into the HTML snapshot. Defaults to
  // every available language on open; user opts OUT via the checkbox
  // group. Only used when format=html.
  const [htmlIncludedLanguages, setHtmlIncludedLanguages] = useState<ExportLanguage[]>([]);

  const availableLanguages = useMemo<ExportLanguage[]>(() => {
    const list = (data?.availableLanguages ?? []) as ExportLanguage[];
    return list.length > 0 ? list : ['es'];
  }, [data]);

  const primaryLanguage = (data?.primaryLanguage) ?? 'es';

  // Snap the language pick back to the row's primary on every open
  // so reopening the modal doesn't carry over a stale selection from a
  // previous row. {@code initialFormat} / {@code initialLanguage} let
  // the assistant pre-fill what it knows; the user can still change
  // either field before clicking Export.
  // Reset-on-open: the modal's local form must snap back to the selected
  // row's defaults every time it opens, including the format/language pre-
  // fills the assistant may have requested. Suppressed because this is the
  // documented React pattern for "reset state when the props change" and
  // refactoring to a key prop would require contract changes at every call site.
  useEffect(() => {
    if (open && data) {
      const wantedLang =
        initialLanguage && availableLanguages.includes(initialLanguage)
          ? initialLanguage
          : primaryLanguage;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLanguage(wantedLang);
      setHtmlDefaultLanguage(wantedLang);
      // Pre-check every available language for the HTML include
      // group — the common case is "share everything I've already
      // translated"; opting OUT of a language is the rare path.
      setHtmlIncludedLanguages([...availableLanguages]);
      // Clamp the format to what the user is allowed to pick — non-DEV
      // users can't select HTML even if it was passed via initialFormat
      // (the option isn't rendered, so a stale 'html' would leave the
      // <select> showing an empty value).
      const wantedFormat = initialFormat ?? 'pdf';
      setFormat(wantedFormat === 'html' && !isDev ? 'pdf' : wantedFormat);
    }
  }, [open, primaryLanguage, data, initialFormat, initialLanguage, availableLanguages, isDev]);

  // Whenever the user flips TO html, pre-fill the default-language
  // picker with whatever they last set the (now-greyed) language
  // picker to. Avoids the "I picked EN, switched format to HTML, but
  // it's defaulting to ES" surprise. Switching back to PDF/PPT leaves
  // the lang picker untouched.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror primary picker into HTML default when the user switches format
    if (format === 'html') setHtmlDefaultLanguage(language);
  }, [format, language]);

  // The default-open language must be one of the included languages.
  // If the user unchecks the currently-default, fall back to the
  // first still-included one so we never end up trying to export
  // with an excluded default.
  useEffect(() => {
    if (htmlIncludedLanguages.length === 0) return;
    if (!htmlIncludedLanguages.includes(htmlDefaultLanguage)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clamp default to a still-included language; cannot be derived during render because it would feed back into its own deps
      setHtmlDefaultLanguage(htmlIncludedLanguages[0]);
    }
  }, [htmlIncludedLanguages, htmlDefaultLanguage]);

  /**
   * Toggle a language's inclusion in the HTML snapshot. Guards
   * against unchecking the last remaining language (the export needs
   * at least one).
   */
  function toggleIncludedLanguage(lng: ExportLanguage) {
    setHtmlIncludedLanguages((prev) => {
      const isIncluded = prev.includes(lng);
      if (isIncluded) {
        if (prev.length === 1) return prev;
        return prev.filter((l) => l !== lng);
      }
      return [...prev, lng];
    });
  }

  function handleExport() {
    // For HTML the chosen "language" is the snapshot's default-open
    // language (recipient can switch among included langs). Every
    // other format uses the top picker's value as the content filter.
    const exportLanguage = format === 'html' ? htmlDefaultLanguage : language;
    const includeLanguages = format === 'html' ? htmlIncludedLanguages : undefined;
    // The colour-scheme picker only applies to PDF exports — pass undefined
    // for the others so callers can default cleanly without needing to know
    // about it.
    const themeArg = format === 'pdf' ? pdfTheme : undefined;
    onExport(format, exportLanguage, includeLanguages, themeArg);
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
      <div className="share-eyebrow">{t('exportModal.eyebrow', { defaultValue: 'Export' })}</div>
      <h2 className="modal-title">{t('exportModal.title', { defaultValue: 'Export report' })}</h2>

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
          {/* DEV-only standalone HTML — single self-contained file with
              every section inlined. Useful for inspecting the full
              payload outside the in-app viewer or sharing with someone
              who doesn't have a Futuros account. */}
          {isDev && (
            <option value="html">
              {t('exportModal.formats.html', {
                defaultValue: 'HTML — Standalone web page (DEV)',
              })}
            </option>
          )}
        </select>
      </div>

      {/* PDF-only colour-scheme picker. The dark scheme mirrors the on-screen
          editorial palette; the light scheme uses a white background and
          darker accent colours, suitable for printing. Hidden for PPT/HTML —
          neither format honours the picker. */}
      {format === 'pdf' && (
        <div className="share-lang-row">
          <label htmlFor="export-pdf-theme" className="share-lang-label">
            {t('exportModal.colourScheme', { defaultValue: 'Colour scheme' })}
          </label>
          <select
            id="export-pdf-theme"
            className="share-lang-select"
            value={pdfTheme}
            onChange={(e) => setPdfTheme(e.target.value as ExportPdfTheme)}
            disabled={isLoading}
          >
            <option value="dark">
              {t('exportModal.themes.dark', {
                defaultValue: 'Dark — Screen / digital',
              })}
            </option>
            <option value="light">
              {t('exportModal.themes.light', {
                defaultValue: 'Light — Print-friendly',
              })}
            </option>
          </select>
        </div>
      )}

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
            // Greyed out for HTML because the standalone bakes every
            // available language — there's nothing to filter. The
            // "Default language" picker below decides which one opens
            // first; the recipient can still toggle in-page.
            disabled={isLoading || format === 'html'}
          >
            {availableLanguages.map((lng) => (
              <option key={lng} value={lng}>
                {t(`share.lang.${lng}`, {
                  defaultValue: lng.toUpperCase(),
                })}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* HTML-only include-languages checkbox group. Mirrors
          ShareModal's chip-checkbox row — same visual language and the
          same opt-out behaviour. The last remaining checked box can't
          be unchecked (the export needs at least one language to bake
          into the snapshot). */}
      {format === 'html' && showLangPicker && (
        <div className="share-lang-row share-lang-row--checks">
          <span className="share-lang-label">
            {t('share.includeLanguages', { defaultValue: 'Include languages' })}
          </span>
          <div className="share-lang-checks">
            {availableLanguages.map((lng) => {
              const checked = htmlIncludedLanguages.includes(lng);
              const lastChecked = checked && htmlIncludedLanguages.length === 1;
              return (
                <label key={lng} className={`share-lang-check${checked ? ' is-checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isLoading || lastChecked}
                    onChange={() => toggleIncludedLanguage(lng)}
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
      )}

      {/* HTML-only "default open language" picker. Shown alongside the
          (greyed) language picker above when format=html and the report
          has translations to choose from. The standalone artefact
          bundles the selected include set; this just sets the default
          view. Only included languages are offered as options. */}
      {format === 'html' && showLangPicker && (
        <div className="share-lang-row">
          <label htmlFor="export-html-default-language" className="share-lang-label">
            {t('exportModal.htmlDefaultLanguage', {
              defaultValue: 'Default language',
            })}
          </label>
          <select
            id="export-html-default-language"
            className="share-lang-select"
            value={htmlDefaultLanguage}
            onChange={(e) => setHtmlDefaultLanguage(e.target.value as ExportLanguage)}
            disabled={isLoading}
          >
            {htmlIncludedLanguages.map((lng) => (
              <option key={lng} value={lng}>
                {t(`share.lang.${lng}`, {
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
