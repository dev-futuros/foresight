import { escapeHtml } from './escape';
import { labelsFor, type LabelTable } from './labels';
import {
  renderBackcasting,
  renderBibliographyPages,
  renderBriefExec,
  renderClosing,
  renderCover,
  renderScenarioDetail,
  renderScenariosIndex,
  renderSignals,
  renderSteepMatrix,
  renderStrategicMap,
  renderToc,
  renderUncertainties,
  type PageMeta,
  type TocEntry,
} from './pages';
import { buildStyles } from './styles';
import type { RenderInput } from './project';

/**
 * Assemble the complete HTML document for a foresight report.
 *
 * <p>The flow is a two-pass build because the TOC needs to know each
 * chapter's final page number, and chapter page numbers depend on how
 * many bibliography pages the data demands:
 *
 * <ol>
 *   <li>First pass: enumerate the section list with placeholder page
 *       numbers (0). Lay out the bibliography against
 *       {@code BIBLIO_ITEMS_PER_PAGE} to learn its page count. Compute
 *       the final page numbers from there.</li>
 *   <li>Second pass: render each section with its correct
 *       {@link PageMeta} (page number + total pages + runhead text).</li>
 * </ol>
 *
 * <p>{@code fontBaseUrl} controls where {@code @font-face} URLs in the
 * stylesheet point. In the live app it's the absolute origin path
 * {@code /fonts/}, so the iframe doc fetches the static TTFs from
 * {@code frontend/public/fonts/} on the same origin. Override for
 * tests or alternative renderers (e.g. WeasyPrint with file:// URLs).
 */
export interface BuildHtmlOptions {
  /** Trailing-slash-terminated URL where the static TTFs live. */
  fontBaseUrl?: string;
  /** Optional override for the language used to resolve chrome strings.
   *  Defaults to whatever {@code input.language} carries. */
  language?: RenderInput['language'];
}

export function buildHtml(input: RenderInput, opts: BuildHtmlOptions = {}): string {
  const language = opts.language ?? input.language;
  const L: LabelTable = labelsFor(language);
  const fontBaseUrl = opts.fontBaseUrl ?? '/fonts/';
  const styles = buildStyles(fontBaseUrl);

  // ── Section enumeration ─────────────────────────────────────────
  // Each section knows how many pages it contributes — most are 1; the
  // scenario detail block is N (one per scenario), the bibliography is
  // computed from the items / per-page cap.
  type SectionId =
    | 'cover'
    | 'toc'
    | 'brief'
    | 'steep'
    | 'uncertainties'
    | 'scenariosIndex'
    | 'scenarioDetail'
    | 'backcasting'
    | 'strategicMap'
    | 'signals'
    | 'sources'
    | 'closing';

  interface Section {
    id: SectionId;
    /** TOC entry — null = not in TOC. */
    tocEntry: null | { number: string; title: string; caption: string };
    pageCount: number;
    /** First page number of this section, populated in the second pass. */
    startPage: number;
  }

  const has = input.has;
  const sections: Section[] = [];
  sections.push({ id: 'cover', tocEntry: null, pageCount: 1, startPage: 0 });
  sections.push({ id: 'toc', tocEntry: null, pageCount: 1, startPage: 0 });
  if (has.brief) {
    sections.push({
      id: 'brief',
      tocEntry: { number: '01', title: `${L.briefLabel} & ${L.execTitle}`, caption: L.briefCaption },
      pageCount: 1,
      startPage: 0,
    });
  }
  if (has.steep) {
    sections.push({
      id: 'steep',
      tocEntry: { number: '02', title: L.steepTitle, caption: L.steepCaption },
      pageCount: 1,
      startPage: 0,
    });
  }
  if (has.uncertainties) {
    sections.push({
      id: 'uncertainties',
      tocEntry: { number: '03', title: L.uncertTitle, caption: L.uncertCaption },
      pageCount: 1,
      startPage: 0,
    });
  }
  if (has.scenarios) {
    sections.push({
      id: 'scenariosIndex',
      tocEntry: { number: '04', title: L.scenariosTitle, caption: L.scenariosCaption },
      pageCount: 1,
      startPage: 0,
    });
    sections.push({
      id: 'scenarioDetail',
      tocEntry: null,
      pageCount: input.scenarios.length,
      startPage: 0,
    });
  }
  if (has.backcasting) {
    sections.push({
      id: 'backcasting',
      tocEntry: { number: '05', title: L.backcastingTitle, caption: L.backcastingCaption },
      pageCount: 1,
      startPage: 0,
    });
  }
  if (has.strategicMap) {
    sections.push({
      id: 'strategicMap',
      tocEntry: { number: '06', title: L.strategicTitle, caption: L.strategicCaption },
      pageCount: 1,
      startPage: 0,
    });
  }
  if (has.signals) {
    sections.push({
      id: 'signals',
      tocEntry: { number: '07', title: L.signalsTitle, caption: L.signalsCaption },
      pageCount: 1,
      startPage: 0,
    });
  }
  if (has.sources) {
    // Estimate bibliography page count by replaying the layout logic
    // — keep this in sync with renderBibliographyPages' chunker. The
    // renderer is the source of truth; we only need a count here.
    const BIBLIO_ITEMS_PER_PAGE = 28;
    let pages = 0;
    let count = 0;
    let bucket = false;
    for (const sec of input.biblioSections) {
      // Header behaves like an "item" boundary: if we're close to
      // the page cap, push a page now.
      if (count > 0 && count >= BIBLIO_ITEMS_PER_PAGE - 4) {
        pages += 1;
        count = 0;
        bucket = false;
      }
      bucket = true;
      for (const _ of sec.items) {
        if (count >= BIBLIO_ITEMS_PER_PAGE) {
          pages += 1;
          count = 0;
          bucket = false;
        }
        count += 1;
        bucket = true;
      }
    }
    if (bucket) pages += 1;
    if (pages === 0) pages = 1; // safety net — at least one biblio page if has.sources
    sections.push({
      id: 'sources',
      tocEntry: { number: '08', title: L.sourcesTitle, caption: L.sourcesCaption },
      pageCount: pages,
      startPage: 0,
    });
  }
  sections.push({ id: 'closing', tocEntry: null, pageCount: 1, startPage: 0 });

  // ── Pass 2: assign page numbers ──────────────────────────────────
  let nextPage = 1;
  for (const s of sections) {
    s.startPage = nextPage;
    nextPage += s.pageCount;
  }
  const totalPages = nextPage - 1;

  const runheadRight = escapeHtml(`${input.orgName} — Foresight ${new Date(input.createdAt).getFullYear()}`);

  // Build TOC entries from sections that carry one.
  const tocEntries: TocEntry[] = sections
    .filter((s): s is Section & { tocEntry: NonNullable<Section['tocEntry']> } => s.tocEntry !== null)
    .map((s) => ({
      number: s.tocEntry.number,
      title: s.tocEntry.title,
      caption: s.tocEntry.caption,
      pageNumber: s.startPage,
    }));

  // ── Pass 3: render each section ─────────────────────────────────
  const html: string[] = [];
  for (const s of sections) {
    const meta = (offset = 0): PageMeta => ({
      pageNumber: s.startPage + offset,
      totalPages,
      runheadRight,
    });
    switch (s.id) {
      case 'cover':
        html.push(renderCover(input, L));
        break;
      case 'toc':
        html.push(renderToc(L, meta(), tocEntries));
        break;
      case 'brief':
        html.push(renderBriefExec(input, L, meta()));
        break;
      case 'steep':
        html.push(renderSteepMatrix(input, L, meta()));
        break;
      case 'uncertainties':
        html.push(renderUncertainties(input, L, meta()));
        break;
      case 'scenariosIndex':
        html.push(renderScenariosIndex(input, L, meta()));
        break;
      case 'scenarioDetail':
        input.scenarios.forEach((sc, i) => {
          html.push(renderScenarioDetail(sc, input, L, meta(i)));
        });
        break;
      case 'backcasting':
        html.push(renderBackcasting(input, L, meta()));
        break;
      case 'strategicMap':
        html.push(renderStrategicMap(input, L, meta()));
        break;
      case 'signals':
        html.push(renderSignals(input, L, meta()));
        break;
      case 'sources': {
        const pageNumbers: number[] = [];
        for (let i = 0; i < s.pageCount; i++) pageNumbers.push(s.startPage + i);
        const pages = renderBibliographyPages(
          input,
          L,
          pageNumbers,
          totalPages,
          runheadRight,
        );
        for (const p of pages) html.push(p);
        break;
      }
      case 'closing':
        html.push(renderClosing(L));
        break;
    }
  }

  const title = `${input.orgName} — Foresight ${new Date(input.createdAt).getFullYear()}`;
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${styles}</style>
</head>
<body>
${html.join('\n')}
</body>
</html>`;
}

