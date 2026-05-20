import i18n from '../../../i18n';
import {
  DEFAULT_LANGUAGE,
  isLanguageCode,
  type LanguageCode,
} from '../../../i18n/languages';
import { logger } from '../../../lib/log';
import type { ReportResponse } from '../../../types/api';
import { printHtmlDocument } from './print';
import { projectReport } from './project';
import { runTightenPass } from './tighten';
import { buildHtml } from './template';

/**
 * Public entry point for the Verdalia foresight-report export.
 *
 * <p>End-to-end flow:
 * <ol>
 *   <li>Project the {@link ReportResponse} into the render-ready
 *       {@link projectReport.RenderInput} (data shape + language).</li>
 *   <li>Run the AI tighten pre-pass against the field-budget map.
 *       Anything that overshoots gets a parallel call to
 *       {@code /api/ai/tighten}; the original text is kept on failure
 *       and hard-truncated only if the tighten output still
 *       overflows.</li>
 *   <li>Assemble the full HTML document from the per-page renderers,
 *       with two-pass page numbering so the TOC reflects the actual
 *       bibliography page count.</li>
 *   <li>Mount the document in an off-screen iframe and call
 *       {@code window.print()}. The user sees the system "Save as PDF"
 *       dialog with a print-perfect preview.</li>
 * </ol>
 *
 * <p>Signature mirrors the previous {@code exportReportPdf} (jsPDF
 * pipeline in {@code ../pdf/index.ts}) so caller code in
 * DashboardPage / ReportPage doesn't change. The {@code theme}
 * parameter is accepted but ignored — the spec mandates a single dark
 * theme, kept here only for type-compatibility while the old call
 * sites still pass it.
 */
export type PdfTheme = 'dark' | 'light';

export async function exportReportPdf(
  report: ReportResponse,
  language?: LanguageCode,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- theme is part of the legacy signature; the Verdalia layout is single-theme so we ignore it. Keep the slot so caller code stays the same.
  _theme: PdfTheme = 'dark',
): Promise<void> {
  const lang: LanguageCode = language
    ? language
    : isLanguageCode(i18n.language)
      ? i18n.language
      : DEFAULT_LANGUAGE;

  logger.debug('pdf-v2', `exporting report ${report.id} (lang=${lang})`);

  // 1. Project to render-ready shape.
  const input = projectReport(report, { language: lang });

  // 2. Tighten oversize fields. Fires in parallel and waits for all.
  await runTightenPass(input, {
    language: lang,
    onProgress: (done, total) => {
      logger.debug('pdf-v2', `tighten progress ${done}/${total}`);
    },
  });

  // 3. Assemble the HTML. fontBaseUrl defaults to /fonts/ — same-origin
  // path the static TTFs ship at under frontend/public/fonts/.
  const html = buildHtml(input, { fontBaseUrl: '/fonts/' });

  // 4. Print via the off-screen iframe. Resolves after the user
  // dismisses the system print dialog.
  await printHtmlDocument(html);
}
