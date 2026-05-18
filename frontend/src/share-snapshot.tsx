import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import i18n from './i18n';
import { SnapshotApp, type SnapshotLang, type SnapshotReport } from './share-snapshot-app';

/**
 * Standalone snapshot entry — the React app that boots inside the
 * downloaded HTML file uploaded to a static bucket.
 *
 * <p>Contract: the HTML export injects two pieces of data into the host
 * page before this module runs:
 *
 * <ul>
 *   <li>A {@code <script id="report-data" type="application/json">} tag
 *       carrying the serialised report PLUS its cached translations.
 *       Shape mirrors a multi-lingual share token:
 *       {@code {id, title, primaryLanguage, inputData, resultData,
 *       translations: {<lang>: {inputData, resultData}, …}}}.</li>
 *   <li>An optional {@code <script id="report-lang">} tag carrying the
 *       ISO-639-1 code the snapshot should open in. Falls back to
 *       {@code report.primaryLanguage}, then Spanish.</li>
 * </ul>
 *
 * <p>If either tag is missing (e.g. someone opens the HTML directly
 * without going through the export pipeline), we render an error
 * placeholder rather than crashing.
 */

function readJsonTag<T>(id: string): T | null {
  const el = document.getElementById(id);
  if (!el?.textContent) return null;
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
  // Resolve the default-open language synchronously so the first
  // render is already in the right language — avoids a flash of
  // primary-language content for shares opened with a non-primary
  // default.
  const defaultLang =
    (readTextTag('report-lang') as SnapshotLang | null) ?? report.primaryLanguage ?? 'es';
  if (i18n.language?.slice(0, 2) !== defaultLang.slice(0, 2)) {
    await i18n.changeLanguage(defaultLang);
  }
  // No StrictMode — second-render side effects (i18n switches, scroll
  // measurements in ReportContent) are noisy in a standalone artefact
  // that has no React DevTools attached anyway.
  createRoot(document.getElementById('root')!).render(<SnapshotApp report={report} />);
}

void boot();
