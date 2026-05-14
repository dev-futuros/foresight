import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import i18n from './i18n';
import IconSprite from './components/IconSprite';
import ShareView, { type ShareReport } from './features/publicShare/ShareView';

/**
 * Standalone snapshot entry — the React app that boots inside the
 * downloaded HTML file uploaded to a static bucket.
 *
 * <p>Contract: the HTML export injects two pieces of data into the host
 * page before this module runs:
 *
 * <ul>
 *   <li>A {@code <script id="report-data" type="application/json">} tag
 *       carrying the serialized report. Type {@code application/json}
 *       means the browser won't execute it as JavaScript and the
 *       contents survive even with raw {@code <}/{@code >}/{@code &}
 *       characters as long as we replace the {@code </script>} sequence
 *       (the only string that can prematurely close a script tag).</li>
 *   <li>An optional {@code <script id="report-lang">} tag holding the
 *       ISO-639-1 export language so the renderer switches i18n before
 *       mounting. Falls back to {@code report.primaryLanguage}, then
 *       Spanish.</li>
 * </ul>
 *
 * <p>If either tag is missing (e.g. someone opens the HTML directly
 * without going through the export pipeline), we render an error
 * placeholder rather than crashing.
 */

interface SnapshotReport extends ShareReport {
  /** Carried so the snapshot can default the language without the export
   *  needing to inject a separate marker tag. */
  primaryLanguage?: 'es' | 'en' | 'ca';
}

function readJsonTag<T>(id: string): T | null {
  const el = document.getElementById(id);
  if (!el || !el.textContent) return null;
  try {
    return JSON.parse(el.textContent) as T;
  } catch {
    return null;
  }
}

function readTextTag(id: string): string | null {
  const el = document.getElementById(id);
  return el?.textContent?.trim() || null;
}

async function boot(): Promise<void> {
  const report = readJsonTag<SnapshotReport>('report-data');
  if (!report) {
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML =
        '<div style="padding:48px;text-align:center;font-family:system-ui;color:#888">' +
        'No report data found in this snapshot.' +
        '</div>';
    }
    return;
  }
  const requestedLang =
    (readTextTag('report-lang') as 'es' | 'en' | 'ca' | null) ??
    report.primaryLanguage ??
    'es';
  if (i18n.language?.slice(0, 2) !== requestedLang.slice(0, 2)) {
    await i18n.changeLanguage(requestedLang);
  }
  // No StrictMode — second-render side effects (i18n switches, scroll
  // measurements in ReportContent) are noisy in a standalone artefact
  // that has no React DevTools attached anyway.
  //
  // {@link IconSprite} is rendered as a sibling of ShareView so the
  // SVG <symbol> definitions live in the document. Tabs reference
  // them via <use href="#i-s"> etc., which resolves against this
  // sprite — without it scenario/wildcard/signal icons render blank.
  createRoot(document.getElementById('root')!).render(
    <>
      <IconSprite />
      <ShareView report={report} />
    </>,
  );
}

void boot();
