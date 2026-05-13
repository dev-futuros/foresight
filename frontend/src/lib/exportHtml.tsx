import type { ReportResponse } from '../types/api';

/**
 * Foresight report — standalone HTML export.
 *
 * <p>Produces a single self-contained {@code .html} file that boots the
 * actual React app inside the document and renders the report
 * identically to the public share view ({@code /share/:token}). The
 * intended use case is uploading the artefact to a static bucket and
 * serving it from a public URL — the recipient never hits the SPA.
 *
 * <p>Architecture: the SPA's build also emits
 * {@code dist/share-snapshot.html}, a separate Vite entry built with
 * {@code vite-plugin-singlefile} so the entire React bundle + every
 * stylesheet is inlined into one file. At export time we fetch that
 * pre-built host page, splice the serialized report JSON into a
 * {@code <script id="report-data" type="application/json">} tag in
 * {@code <head>}, and trigger a download. The downloaded file is
 * bucket-ready — no build step, no Node at runtime; opening it in any
 * browser mounts the snapshot entry
 * ({@link ../share-snapshot.tsx}), which reads the data tag and
 * renders {@link ../features/publicShare/ShareView}.
 *
 * <p>Why fetch instead of bundling at the call site: the SPA is the
 * source of truth for what the share view looks like; reusing the live
 * React components (not a hand-rolled HTML approximation) guarantees
 * the standalone stays pixel-identical to the share view without any
 * "keep these in sync" annotation. The cost is ~150kb of React runtime
 * in each exported file — acceptable for an artefact stored on a CDN
 * and read for years.
 *
 * <p>DEV-only export option (the picker in
 * {@link ../components/ExportModal} gates the {@code 'html'} option
 * behind {@link useIsDev}).
 */

/* ── Helpers ─────────────────────────────────────────────────────── */

function escapeHtml(s: string | undefined | null): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on next tick so the browser has time to process the click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Encode a JSON payload safe for embedding in a {@code <script>} tag.
 * The only string that can prematurely close the tag is the literal
 * sequence {@code </script>} (case-insensitive) — escaping the slash
 * with {@code <\/script>} preserves the JSON's meaning while making the
 * sequence un-recognised by the HTML parser. Also defensively escape
 * line-separator + paragraph-separator characters which can break
 * JSON-in-JS but are valid in JSON itself.
 */
function jsonForScriptTag(value: unknown): string {
  return JSON.stringify(value)
    .replace(/<\/(script)/gi, '<\\/$1')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Splice the report payload and chosen language into the snapshot host
 * HTML. Inserts two {@code <script>} tags as the FIRST children of
 * {@code <head>} so the data is available before the bundled entry
 * module runs (its {@code type="module"} default-defers execution to
 * after the document is parsed; injecting at the top of head guarantees
 * order regardless).
 */
function injectReportData(
  hostHtml: string,
  report: ReportResponse,
  language: 'es' | 'en',
): string {
  // Snapshot entry expects the report under {@code window.__REPORT__}
  // via the JSON tag; we attach `primaryLanguage` so the entry has a
  // sensible default if the lang tag is somehow stripped.
  const reportPayload = { ...report, primaryLanguage: report.primaryLanguage ?? language };
  const dataTag = `<script id="report-data" type="application/json">${jsonForScriptTag(reportPayload)}</script>`;
  // {@code type="text/plain"} keeps the browser from trying to execute
  // it; the snapshot entry just reads {@code textContent}.
  const langTag = `<script id="report-lang" type="text/plain">${escapeHtml(language)}</script>`;
  // Set the document language too so screen readers pick it up.
  const withLangAttr = hostHtml.replace(/<html\s+lang="[^"]*"/i, `<html lang="${escapeHtml(language)}"`);
  // Update the document title to match the report.
  const withTitle = withLangAttr.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(report.title)}</title>`,
  );
  // Inject the data tags right after <head> opens — before any other
  // <head> child — so they're parsed before the snapshot bundle runs.
  return withTitle.replace(/<head>/i, `<head>\n    ${dataTag}\n    ${langTag}`);
}

/* ── Public entry point ──────────────────────────────────────────── */

/**
 * Render the report as a standalone HTML file and trigger a download.
 *
 * <p>Steps:
 * <ol>
 *   <li>Fetch the pre-built {@code /share-snapshot.html} host page from
 *       the SPA's own origin — same host the user is currently on.</li>
 *   <li>Inject the report payload + language as inline {@code <script>}
 *       tags.</li>
 *   <li>Trigger a download. The downloaded file is fully self-contained
 *       — drop it into any bucket and the public URL renders identically
 *       to {@code /share/:token}.</li>
 * </ol>
 *
 * <p>In dev mode the fetched HTML references {@code /src/share-snapshot.tsx}
 * as a module URL; opening the downloaded file from disk won't resolve
 * that path. Run {@code npm run build} then {@code npm run preview} to
 * exercise the production pipeline locally — that produces a real
 * single-file artefact via vite-plugin-singlefile.
 */
export async function exportReportHtml(
  report: ReportResponse,
  language?: 'es' | 'en',
): Promise<void> {
  const lang: 'es' | 'en' = (language ?? (report.primaryLanguage as 'es' | 'en') ?? 'es');
  const hostUrl = new URL('/share-snapshot.html', window.location.origin);
  // Cache-bust during dev so HMR-modified snapshots load fresh; harmless
  // in prod (the bucket can still cache the file aggressively at its
  // own URL).
  hostUrl.searchParams.set('t', String(Date.now()));
  const res = await fetch(hostUrl.toString(), { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(
      `Snapshot host page returned HTTP ${res.status}. Did the build emit share-snapshot.html?`,
    );
  }
  const hostHtml = await res.text();
  // Dev-mode artefacts reference {@code /@vite/client} and
  // {@code /src/share-snapshot.tsx} as absolute module URLs, which
  // resolve to {@code file:///} when the download is opened from disk
  // and get blocked by the browser as cross-origin requests. Singlefile
  // builds inline everything and don't have those references. Warn the
  // dev with a clear hint instead of letting them stare at a CORS
  // failure in the console.
  if (hostHtml.includes('/@vite/client') || hostHtml.includes('/@react-refresh')) {
    // eslint-disable-next-line no-console
    console.warn(
      '[exportReportHtml] You are exporting against the dev server. The downloaded file references dev-only module URLs and will only work while the dev server is running — opening it from disk will fail with CORS errors. To produce a truly standalone artefact, run `npm run build:snapshot && npm run preview` and export from the preview URL.',
    );
  }
  const html = injectReportData(hostHtml, report, lang);
  const filename = `${slugify(report.title)}-${lang}.html`;
  downloadBlob(filename, html, 'text/html;charset=utf-8');
}
