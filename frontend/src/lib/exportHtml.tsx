import api from './api';
import type { ReportResponse } from '../types/api';

type ExportLanguage = 'es' | 'en';

/**
 * Per-language slice baked into the standalone HTML snapshot. Mirrors the
 * shape the backend's {@code /translate} endpoint returns and the report's
 * authored payload — same fields, different language.
 */
interface LanguagePayload {
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
}

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
 * Splice the report payload and chosen default-open language into the
 * snapshot host HTML. The payload is a multi-lingual envelope when the
 * report has cached translations — the snapshot entry detects that
 * shape and renders its in-page language switcher, mirroring the
 * editor + share viewer.
 */
function injectReportData(
  hostHtml: string,
  report: ReportResponse,
  defaultLanguage: ExportLanguage,
  translations: Record<string, LanguagePayload>,
): string {
  // The payload carries: the report metadata, the primary-language
  // payload (in the top-level inputData/resultData), and a translations
  // map keyed by language for the OTHER languages. Mirrors the share
  // token's wire shape so the snapshot entry can reuse the same
  // resolver logic the public share page uses.
  const reportPayload = {
    ...report,
    primaryLanguage: report.primaryLanguage ?? defaultLanguage,
    translations,
  };
  const dataTag = `<script id="report-data" type="application/json">${jsonForScriptTag(reportPayload)}</script>`;
  // {@code type="text/plain"} keeps the browser from trying to execute
  // it; the snapshot entry just reads {@code textContent}.
  const langTag = `<script id="report-lang" type="text/plain">${escapeHtml(defaultLanguage)}</script>`;
  // Set the document language too so screen readers pick it up.
  const withLangAttr = hostHtml.replace(/<html\s+lang="[^"]*"/i, `<html lang="${escapeHtml(defaultLanguage)}"`);
  // Update the document title to match the report.
  const withTitle = withLangAttr.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(report.title)}</title>`,
  );
  // Inject the data tags right before </head> closes — NOT at the
  // start of <head>. The browser's encoding-detection algorithm only
  // scans the first ~1024 bytes for a <meta charset> declaration; the
  // serialized report payload runs into the hundreds of kilobytes, so
  // placing data tags up top pushes <meta charset="UTF-8"> past that
  // detection window and the document falls back to Latin-1 — em-
  // dashes (`—`) render as the mojibake `â€"`, accents become garbled,
  // etc. Trailing injection keeps the charset meta tag near byte 0
  // where the parser actually looks for it. The snapshot bundle is a
  // {@code type="module"} script that defers until DOMContentLoaded,
  // so the data tags being last-in-head is functionally identical to
  // first-in-head from the entry's perspective.
  return withTitle.replace(/<\/head>/i, `    ${dataTag}\n    ${langTag}\n  </head>`);
}

/**
 * Resolve a chosen set of languages into {@link LanguagePayload} pairs,
 * suitable for baking into the standalone snapshot.
 *
 * <p>{@code report} is the report row in its authored language; the
 * translate endpoint is server-side cache-warm so the extra round-trips
 * for non-primary languages are fast (no Anthropic calls).
 *
 * <p>{@code include} is the user-selected subset (e.g. from the export
 * modal's checkbox group). When undefined/empty the function defaults
 * to every available language, matching the old behaviour for callers
 * that don't expose the filter.
 *
 * <p>Returns a map keyed by every requested language → its payload.
 * Languages not present in {@code report.availableLanguages} are
 * silently dropped (can't materialise something that isn't cached).
 */
async function resolveLanguagePayloads(
  report: ReportResponse,
  kind: 'reports' | 'examples',
  include: ExportLanguage[] | undefined,
): Promise<Record<ExportLanguage, LanguagePayload>> {
  const available = (report.availableLanguages ?? []) as ExportLanguage[];
  const target: ExportLanguage[] = (
    include && include.length > 0 ? include : available
  ).filter((l): l is ExportLanguage => available.includes(l));

  const out: Record<string, LanguagePayload> = {};
  // Primary language payload is right on the report row — no fetch
  // needed. Fan out cache-warm /translate calls for the rest in
  // parallel.
  const fetchTargets: ExportLanguage[] = [];
  for (const lng of target) {
    if (lng === report.primaryLanguage) {
      out[lng] = { inputData: report.inputData, resultData: report.resultData };
    } else {
      fetchTargets.push(lng);
    }
  }
  if (fetchTargets.length > 0) {
    const entries = await Promise.all(
      fetchTargets.map(async (lng) => {
        const res = await api.post<LanguagePayload>(
          `/${kind}/${report.id}/translate`,
          null,
          { params: { targetLanguage: lng } },
        );
        return [lng, res.data] as const;
      }),
    );
    for (const [lng, payload] of entries) {
      out[lng] = payload;
    }
  }
  return out as Record<ExportLanguage, LanguagePayload>;
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
  defaultLanguage?: ExportLanguage,
  kind: 'report' | 'example' = 'report',
  includeLanguages?: ExportLanguage[],
): Promise<void> {
  // The snapshot's "primary" is whichever language the user picked as
  // the default-open view. inputData/resultData hold that payload at
  // the top level; the other selected languages ride along in the
  // translations map.
  const reportPrimary: ExportLanguage =
    (report.primaryLanguage as ExportLanguage) ?? 'es';
  const openLang: ExportLanguage = defaultLanguage ?? reportPrimary;
  const apiBase = kind === 'example' ? 'examples' : 'reports';

  // Make sure the default-open language is always part of the include
  // set — you can't export an artefact without its own default
  // language. The modal already enforces this, but the function-level
  // guard makes the contract explicit for any future callers.
  const include: ExportLanguage[] | undefined = includeLanguages
    ? (includeLanguages.includes(openLang)
        ? includeLanguages
        : [openLang, ...includeLanguages])
    : undefined;

  // Resolve every requested language's payload BEFORE we touch the
  // snapshot host page — if any translation fetch errors, we surface
  // the failure to the user without leaving a half-baked download.
  const payloads = await resolveLanguagePayloads(report, apiBase, include);
  const primary: LanguagePayload = payloads[openLang] ?? {
    inputData: report.inputData,
    resultData: report.resultData,
  };
  // Translations map = every resolved language EXCEPT the snapshot's
  // primary (its content already lives in the top-level columns).
  const translations: Record<string, LanguagePayload> = {};
  for (const [lng, payload] of Object.entries(payloads)) {
    if (lng === openLang) continue;
    translations[lng] = payload;
  }
  // The snapshot's top-level fields reflect the chosen default-open
  // language — primary on the snapshot does NOT have to match the
  // report's authored primary. The recipient sees this language
  // first; the rest are reachable via the in-page switcher.
  const snapshotReport: ReportResponse = {
    ...report,
    primaryLanguage: openLang,
    inputData: primary.inputData,
    resultData: primary.resultData,
  };

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
     
    console.warn(
      '[exportReportHtml] You are exporting against the dev server. The downloaded file references dev-only module URLs and will only work while the dev server is running — opening it from disk will fail with CORS errors. To produce a truly standalone artefact, run `npm run build:snapshot && npm run preview` and export from the preview URL.',
    );
  }
  const html = injectReportData(hostHtml, snapshotReport, openLang, translations);
  const filename = `${slugify(report.title)}-${openLang}.html`;
  downloadBlob(filename, html, 'text/html;charset=utf-8');
}
