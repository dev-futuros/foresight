import jsPDF from 'jspdf';
import i18n from '../i18n';
import type {
  BackcastingEntry,
  BackcastingMilestone,
  DrivingForce,
  KeyUncertainty,
  Scenario,
  ScenarioLogic,
  ScenarioPlanning,
  SourceItem,
  Sources,
  StrategicPriority,
  UncertaintyAxis,
  WeakSignal,
  Wildcard,
} from './aiClient';
import type { ReportResponse } from '../types/api';

/**
 * Foresight report — PDF export with editorial / magazine layout.
 *
 * <p>Design notes:
 * <ul>
 *   <li>Brand-aligned palette ported from {@code src/index.css} — dark
 *       surfaces, warm cream ink, gold accent, and the green / blue /
 *       orange / purple / red palette used to colour-code scenarios,
 *       dimensions and impact levels consistently across sections.</li>
 *   <li>Typography uses the Futuros brand triad (DM Sans / Playfair
 *       Display / DM Mono) loaded at runtime — see {@link ensureFonts}.
 *       Falls back to helvetica / times / courier per-family on TTF
 *       load failure.</li>
 *   <li>Magazine-grade structure: cover → TOC → section-opener pages
 *       with oversized gold numerals → editorial section content with
 *       drop caps, pull quotes, ranked numerals and colour-coded
 *       sidebar accents. Each major section starts on its own page so
 *       page breaks coincide with reading breaks.</li>
 * </ul>
 *
 * <p>The entry point {@link exportReportPdf} is async to accommodate
 * the runtime font fetch on first call. Subsequent calls reuse the
 * cached font blobs and complete synchronously after a microtask.
 */

/* ── Type projections matching the real backend payload ────────────── */

type CompanyProfile = {
  name?: string;
  sector?: string;
  size?: string;
  market?: string;
  horizon?: string;
  challenge?: string;
  strengths?: string;
  consultantName?: string;
  consultantCompany?: string;
};

type SteepBlock = Partial<Record<'S' | 'T' | 'E' | 'ENV' | 'P', string>>;

type InputData = {
  companyProfile?: CompanyProfile;
  globalSteep?: SteepBlock;
  steep?: SteepBlock;
};

type ResultData = {
  executiveSummary?: string;
  keyUncertainties?: KeyUncertainty[];
  scenarios?: Scenario[];
  scenarioPlanning?: ScenarioPlanning;
  backcasting?: BackcastingEntry[];
  strategicMap?: StrategicPriority[];
  weakSignals?: WeakSignal[];
  wildcards?: Wildcard[];
  sources?: Sources;
};

/* ── Brand tokens (mirrored from src/index.css) ───────────────────── */

const BG = '#0a0a0d';
const SURFACE_1 = '#11111a';
const SURFACE_2 = '#17171f';
const SURFACE_3 = '#1f1f29';

const INK = '#f4efe5';
const INK_SOFT = '#bcb6ac';
const INK_MUTE = '#7d7872';
const INK_FAINT = '#403d39';

const GOLD = '#d4a853';
const GOLD_BG = '#1f1a0d';

const GREEN = '#6ee7b7';
const GREEN_BG = '#0e2018';
const BLUE = '#93bff8';
const BLUE_BG = '#0e1622';
const ORANGE = '#fbb77b';
const ORANGE_BG = '#22160d';
const PURPLE = '#d6bdfb';
const PURPLE_BG = '#170e22';
const RED = '#fb8e8e';
const RED_BG = '#220d0d';

const LINE = '#1f1f25';
const LINE_STRONG = '#2c2c34';
const LINE_ACCENT = '#3a2f17';

/* Brand fonts. See ensureFonts. */
let FONT_SANS = 'helvetica';
let FONT_SERIF = 'times';
let FONT_MONO = 'courier';

let fontState: 'idle' | 'loading' | 'ready' = 'idle';
let fontPromise: Promise<void> | null = null;
let cachedFontBlobs: CachedFont[] = [];

interface FontFile {
  url: string;
  family: string;
  style: 'normal' | 'bold' | 'italic' | 'bolditalic';
}
interface CachedFont extends FontFile {
  base64: string;
}

const BRAND_FONTS: FontFile[] = [
  { url: '/fonts/DMSans-Regular.ttf', family: 'DMSans', style: 'normal' },
  { url: '/fonts/DMSans-Medium.ttf', family: 'DMSans', style: 'bold' },
  { url: '/fonts/DMSans-Italic.ttf', family: 'DMSans', style: 'italic' },
  { url: '/fonts/PlayfairDisplay-Regular.ttf', family: 'Playfair', style: 'normal' },
  { url: '/fonts/PlayfairDisplay-Bold.ttf', family: 'Playfair', style: 'bold' },
  { url: '/fonts/PlayfairDisplay-Italic.ttf', family: 'Playfair', style: 'italic' },
  { url: '/fonts/DMMono-Regular.ttf', family: 'DMMono', style: 'normal' },
  { url: '/fonts/DMMono-Medium.ttf', family: 'DMMono', style: 'bold' },
];

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

async function ensureFonts(doc: jsPDF): Promise<void> {
  if (fontState === 'ready') {
    registerCachedFonts(doc);
    return;
  }
  if (fontState === 'loading' && fontPromise) {
    await fontPromise;
    // TS narrows `fontState` to 'loading' from the outer check and
    // doesn't track the mutation that happens inside fontPromise. The
    // cast re-broadens the type so the runtime check survives.
    if ((fontState as 'idle' | 'loading' | 'ready') === 'ready') {
      registerCachedFonts(doc);
    }
    return;
  }
  fontState = 'loading';
  fontPromise = (async () => {
    try {
      const fetched = await Promise.all(
        BRAND_FONTS.map(async (f) => {
          try {
            const r = await fetch(f.url);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const buf = await r.arrayBuffer();
            return { ...f, base64: bufferToBase64(buf) };
          } catch {
            return null;
          }
        }),
      );
      const byFamily = new Map<string, CachedFont[]>();
      for (const f of fetched) {
        if (!f) continue;
        const arr = byFamily.get(f.family) ?? [];
        arr.push(f);
        byFamily.set(f.family, arr);
      }
      const expected = new Map<string, number>();
      for (const f of BRAND_FONTS) {
        expected.set(f.family, (expected.get(f.family) ?? 0) + 1);
      }
      cachedFontBlobs = [];
      for (const [family, files] of byFamily) {
        if (files.length === expected.get(family)) cachedFontBlobs.push(...files);
      }
      const have = (fam: string) => cachedFontBlobs.some((f) => f.family === fam);
      if (have('DMSans')) FONT_SANS = 'DMSans';
      if (have('Playfair')) FONT_SERIF = 'Playfair';
      if (have('DMMono')) FONT_MONO = 'DMMono';
      fontState = cachedFontBlobs.length > 0 ? 'ready' : 'idle';
      if (fontState === 'ready') registerCachedFonts(doc);
    } catch {
      fontState = 'idle';
    }
  })();
  await fontPromise;
}

function registerCachedFonts(doc: jsPDF) {
  const failedFamilies = new Set<string>();
  for (const f of cachedFontBlobs) {
    if (failedFamilies.has(f.family)) continue;
    const filename = f.url.split('/').pop() ?? `${f.family}-${f.style}.ttf`;
    try {
      doc.addFileToVFS(filename, f.base64);
      doc.addFont(filename, f.family, f.style);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[exportPdf] Could not register ${f.family} (${f.style}) — likely a ` +
          `variable-font TTF jsPDF can't parse. Drop the *static* TTFs from ` +
          `the Google Fonts static/ subfolder into public/fonts/. Falling ` +
          `back to built-in for ${f.family}.`,
        err,
      );
      failedFamilies.add(f.family);
    }
  }
  if (failedFamilies.size > 0) {
    cachedFontBlobs = cachedFontBlobs.filter((f) => !failedFamilies.has(f.family));
    if (failedFamilies.has('DMSans')) FONT_SANS = 'helvetica';
    if (failedFamilies.has('Playfair')) FONT_SERIF = 'times';
    if (failedFamilies.has('DMMono')) FONT_MONO = 'courier';
  }
}

/* ── Layout constants ─────────────────────────────────────────────── */

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 24;
const MARGIN_TOP = 28;
const MARGIN_BOTTOM = 24;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const PAGE_BOTTOM = PAGE_H - MARGIN_BOTTOM;

/* ── Page chrome ──────────────────────────────────────────────────── */

function paintBackground(doc: jsPDF) {
  doc.setFillColor(BG);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
}

function addPage(doc: jsPDF): number {
  doc.addPage();
  paintBackground(doc);
  return MARGIN_TOP;
}

function checkY(doc: jsPDF, y: number, needed = 12): number {
  if (y + needed > PAGE_BOTTOM) return addPage(doc);
  return y;
}

/* ── Typography ───────────────────────────────────────────────────── */

type FontWeight = 'normal' | 'bold' | 'italic' | 'bolditalic';

function setText(
  doc: jsPDF,
  color: string,
  size: number,
  weight: FontWeight = 'normal',
  family: string = FONT_SANS,
) {
  doc.setTextColor(color);
  doc.setFontSize(size);
  doc.setFont(family, weight);
}

/**
 * Body paragraph renderer with paragraph-break support, line-level
 * pagination, and an optional drop cap on the first letter of the
 * very first paragraph. Used for narrative text (executive summary,
 * scenario descriptions, etc.).
 */
function body(
  doc: jsPDF,
  y: number,
  text: string,
  opts: {
    indent?: number;
    maxWidth?: number;
    color?: string;
    size?: number;
    family?: string;
    weight?: FontWeight;
    leading?: number;
    trailingGap?: number;
    paragraphGap?: number;
  } = {},
): number {
  const indent = opts.indent ?? MARGIN_X;
  const maxWidth = opts.maxWidth ?? CONTENT_W - (indent - MARGIN_X);
  const size = opts.size ?? 10.5;
  const leading = opts.leading ?? size * 0.55;
  const paragraphGap = opts.paragraphGap ?? leading * 0.7;
  const trailingGap = opts.trailingGap ?? leading * 0.6;
  setText(doc, opts.color ?? INK_SOFT, size, opts.weight ?? 'normal', opts.family ?? FONT_SANS);
  const paragraphs = splitParagraphs(text);
  for (let p = 0; p < paragraphs.length; p++) {
    const lines = doc.splitTextToSize(paragraphs[p].trim(), maxWidth) as string[];
    for (const ln of lines) {
      y = checkY(doc, y, leading + 1);
      doc.text(ln, indent, y);
      y += leading;
    }
    if (p < paragraphs.length - 1) y += paragraphGap;
  }
  return y + trailingGap;
}

/**
 * Split body text into paragraphs on either real newlines (`\n\n`)
 * or literal backslash-escape sequences (`\\n\\n`). The model
 * occasionally returns the latter when its JSON output isn't fully
 * unescaped during analysis — splitting on both keeps the rendered
 * body free of visible `\n` characters.
 */
function splitParagraphs(text: string): string[] {
  return text
    .replace(/\\n/g, '\n')
    .split(/\n{2,}/);
}

/** Measure a body block in mm without drawing it. */
function measureBody(
  doc: jsPDF,
  text: string,
  opts: { size?: number; family?: string; weight?: FontWeight; maxWidth: number; leading?: number },
): number {
  const size = opts.size ?? 10.5;
  const leading = opts.leading ?? size * 0.55;
  setText(doc, INK, size, opts.weight ?? 'normal', opts.family ?? FONT_SANS);
  const paragraphs = splitParagraphs(text);
  let h = 0;
  paragraphs.forEach((p, i) => {
    const lines = doc.splitTextToSize(p.trim(), opts.maxWidth) as string[];
    h += lines.length * leading;
    if (i < paragraphs.length - 1) h += leading * 0.7;
  });
  return h;
}

/**
 * Section header — small uppercase mono eyebrow with a gold rule
 * underneath, matching the on-screen {@code .section-label} pattern.
 * Used inside section bodies for sub-blocks (e.g. "Opportunities"
 * within a scenario card). Major sections instead use section-opener
 * pages — section openers are inlined per renderer.
 */
function sectionLabel(
  doc: jsPDF,
  y: number,
  text: string,
  color = GOLD,
  nextBlockH = 24,
): number {
  // Reserve enough space for the label plus the first content block
  // that follows. Without this, a label can land at the bottom of a
  // page while its content paginates to the next, leaving an orphan.
  y = checkY(doc, y, 14 + nextBlockH);
  setText(doc, color, 8, 'bold', FONT_MONO);
  doc.text(text.toUpperCase(), MARGIN_X, y);
  doc.setDrawColor(LINE_ACCENT);
  doc.setLineWidth(0.25);
  doc.line(MARGIN_X, y + 2.5, PAGE_W - MARGIN_X, y + 2.5);
  return y + 11;
}

function subLabel(doc: jsPDF, y: number, text: string, color = GOLD): number {
  y = checkY(doc, y, 10);
  setText(doc, color, 7.5, 'bold', FONT_MONO);
  doc.text(text.toUpperCase(), MARGIN_X, y);
  return y + 6;
}

/* ── Primitives ───────────────────────────────────────────────────── */

function card(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: string; border?: string; stripe?: string; radius?: number } = {},
) {
  const r = opts.radius ?? 2.5;
  doc.setFillColor(opts.fill ?? SURFACE_1);
  doc.setDrawColor(opts.border ?? LINE);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, r, r, 'FD');
  if (opts.stripe) {
    doc.setFillColor(opts.stripe);
    doc.rect(x, y, 1.4, h, 'F');
  }
}

function pill(
  doc: jsPDF,
  x: number,
  y: number,
  text: string,
  color: string,
  bg: string,
): number {
  const label = text.toUpperCase();
  setText(doc, color, 7, 'bold', FONT_MONO);
  const textW = doc.getTextWidth(label);
  const padX = 2.6;
  const h = 4.6;
  const w = textW + padX * 2;
  doc.setFillColor(bg);
  doc.roundedRect(x, y - h + 1.2, w, h, 1.2, 1.2, 'F');
  setText(doc, color, 7, 'bold', FONT_MONO);
  doc.text(label, x + padX, y);
  return w;
}

function bar(doc: jsPDF, x: number, y: number, w: number, pct: number, color: string) {
  const v = Math.max(0, Math.min(100, pct));
  doc.setFillColor(SURFACE_3);
  doc.roundedRect(x, y, w, 1.4, 0.5, 0.5, 'F');
  if (v > 0) {
    doc.setFillColor(color);
    doc.roundedRect(x, y, w * (v / 100), 1.4, 0.5, 0.5, 'F');
  }
}

function dot(doc: jsPDF, x: number, y: number, color: string, size = 1.4) {
  doc.setFillColor(color);
  doc.circle(x, y, size / 2, 'F');
}

function dotBullets(
  doc: jsPDF,
  y: number,
  items: string[],
  color: string,
  opts: { size?: number; indent?: number; maxWidth?: number; textColor?: string } = {},
): number {
  const size = opts.size ?? 10;
  const leading = size * 0.55;
  const indent = opts.indent ?? MARGIN_X;
  const dotX = indent;
  const textX = indent + 4;
  const maxWidth = opts.maxWidth ?? CONTENT_W - 4 - (indent - MARGIN_X);
  for (const it of items) {
    if (!it) continue;
    setText(doc, opts.textColor ?? INK_SOFT, size, 'normal', FONT_SANS);
    const lines = doc.splitTextToSize(it, maxWidth) as string[];
    for (let i = 0; i < lines.length; i++) {
      y = checkY(doc, y, leading + 1);
      if (i === 0) dot(doc, dotX + 0.5, y - 1.4, color, 1.5);
      doc.text(lines[i], textX, y);
      y += leading;
    }
    y += 0.6;
  }
  return y + 1;
}

/**
 * No-pagination variant of {@link dotBullets} — draws at the given y
 * without ever calling `checkY`. Required for multi-column grid
 * layouts where a per-line pagination would shift the doc cursor to
 * a new page mid-column and break the side-by-side rendering of
 * subsequent columns. Callers must pre-measure to ensure the block
 * fits the available page space.
 */
function drawBulletsNoPaginate(
  doc: jsPDF,
  yStart: number,
  items: string[],
  color: string,
  opts: { size?: number; leading?: number; indent: number; maxWidth: number; textColor?: string },
): number {
  const size = opts.size ?? 9;
  const leading = opts.leading ?? size * 0.55;
  const textX = opts.indent + 4;
  let y = yStart;
  for (const it of items) {
    if (!it) continue;
    setText(doc, opts.textColor ?? INK_SOFT, size, 'normal', FONT_SANS);
    const lines = doc.splitTextToSize(it, opts.maxWidth) as string[];
    for (let i = 0; i < lines.length; i++) {
      if (i === 0) dot(doc, opts.indent + 0.5, y - 1.4, color, 1.4);
      doc.text(lines[i], textX, y);
      y += leading;
    }
    y += 0.4;
  }
  return y + 0.5;
}

/**
 * Small uppercase mono kicker — eyebrow used above headlines. Returns
 * the y position after rendering (caller controls leading).
 */
function kicker(doc: jsPDF, x: number, y: number, text: string, color = GOLD, size = 7.5): number {
  setText(doc, color, size, 'bold', FONT_MONO);
  doc.text(text.toUpperCase(), x, y);
  return y;
}

/**
 * Standfirst / deck — the italic serif paragraph between headline and
 * body. Sized between headline and body; wraps to width `w`.
 */
function standfirst(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  text: string,
  opts: { size?: number; color?: string; leading?: number } = {},
): number {
  const size = opts.size ?? 14;
  const leading = opts.leading ?? size * 0.62;
  setText(doc, opts.color ?? INK, size, 'italic', FONT_SERIF);
  const lines = doc.splitTextToSize(text, w) as string[];
  for (const ln of lines) {
    y = checkY(doc, y, leading + 1);
    doc.text(ln, x, y);
    y += leading;
  }
  return y + 2;
}

/**
 * In-page section header — kicker + numeral + title + gold rule, on
 * the current page (no `addPage`). Use for sections that don't deserve
 * a full opener spread. Also records a TOC entry.
 */
function pageHeader(
  doc: jsPDF,
  y: number,
  title: string,
  kickerText: string,
  color = GOLD,
): number {
  // Record TOC entry on current page.
  const num = String(tocEntries.length + 1).padStart(2, '0');
  const page = (doc.getCurrentPageInfo() as { pageNumber: number }).pageNumber;
  tocEntries.push({ num, title, page, color });

  y = checkY(doc, y, 32);
  // Left: numeral + kicker stacked
  setText(doc, color, 28, 'bold', FONT_SERIF);
  doc.text(num, MARGIN_X, y + 4);
  setText(doc, INK_MUTE, 7.5, 'bold', FONT_MONO);
  doc.text(kickerText.toUpperCase(), MARGIN_X, y + 12);

  // Right: title — multi-line serif display, right of numeral
  setText(doc, INK, 22, 'bold', FONT_SERIF);
  const titleX = MARGIN_X + 18;
  const titleW = CONTENT_W - 18;
  const lines = doc.splitTextToSize(title, titleW) as string[];
  let ty = y + 4;
  for (const ln of lines) {
    doc.text(ln, titleX, ty);
    ty += 9;
  }
  // Gold rule under header
  ty = Math.max(ty, y + 16);
  ty += 2;
  doc.setDrawColor(color);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, ty, PAGE_W - MARGIN_X, ty);
  return ty + 8;
}

/* ── i18n helpers ─────────────────────────────────────────────────── */

const tx = (k: string, fallback?: string): string => {
  const v = i18n.t(k);
  if (typeof v === 'string' && v && v !== k) return v;
  return fallback ?? k;
};

const isEnLang = () => !!i18n.language?.startsWith('en');

function steepLabel(k: 'S' | 'T' | 'E' | 'ENV' | 'P'): string {
  switch (k) {
    case 'S':
      return tx('wizard.steep.dimensions.social', 'Social');
    case 'T':
      return tx('wizard.steep.dimensions.technological', 'Technological');
    case 'E':
      return tx('wizard.steep.dimensions.economic', 'Economic');
    case 'ENV':
      return tx('wizard.steep.dimensions.environmental', 'Environmental');
    case 'P':
      return tx('wizard.steep.dimensions.political', 'Political');
  }
}

function steepColor(k: 'S' | 'T' | 'E' | 'ENV' | 'P'): { fg: string; bg: string } {
  switch (k) {
    case 'S':
      return { fg: BLUE, bg: BLUE_BG };
    case 'T':
      return { fg: GREEN, bg: GREEN_BG };
    case 'E':
      return { fg: GOLD, bg: GOLD_BG };
    case 'ENV':
      return { fg: GREEN, bg: GREEN_BG };
    case 'P':
      return { fg: PURPLE, bg: PURPLE_BG };
  }
}

function dimensionColors(dim: string | undefined): { fg: string; bg: string } {
  switch ((dim ?? '').toLowerCase()) {
    case 'social':
      return { fg: BLUE, bg: BLUE_BG };
    case 'tecnológico':
    case 'tecnologico':
    case 'technological':
      return { fg: GREEN, bg: GREEN_BG };
    case 'económico':
    case 'economico':
    case 'economic':
      return { fg: GOLD, bg: GOLD_BG };
    case 'medioambiental':
    case 'environmental':
      return { fg: GREEN, bg: GREEN_BG };
    case 'político':
    case 'politico':
    case 'political':
      return { fg: PURPLE, bg: PURPLE_BG };
    default:
      return { fg: GOLD, bg: GOLD_BG };
  }
}

function scenarioColors(type: string | undefined, idx = 0): { fg: string; bg: string } {
  const t = (type ?? '').toLowerCase();
  if (t.startsWith('probab')) return { fg: GREEN, bg: GREEN_BG };
  if (t.startsWith('plausib')) return { fg: BLUE, bg: BLUE_BG };
  if (t.startsWith('posib') || t.startsWith('possib')) return { fg: ORANGE, bg: ORANGE_BG };
  const fall = [GREEN, BLUE, ORANGE][idx % 3];
  const fallBg = [GREEN_BG, BLUE_BG, ORANGE_BG][idx % 3];
  return { fg: fall, bg: fallBg };
}

function impactLabel(level: 'low' | 'medium' | 'high'): string {
  return tx(`report.results.impact.${level}`, level);
}

function impactColors(level: 'low' | 'medium' | 'high'): { fg: string; bg: string } {
  if (level === 'high') return { fg: GREEN, bg: GREEN_BG };
  if (level === 'low') return { fg: RED, bg: RED_BG };
  return { fg: ORANGE, bg: ORANGE_BG };
}

function parsePercent(s: string | undefined): number {
  if (!s) return 0;
  const m = s.match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : 0;
}

/**
 * Normalise a STEEP block into the canonical `S/T/E/ENV/P` shape used
 * by every PDF renderer. The wizard's StepSteep saves with full names
 * (`social`, `technological`, …) and StepGlobal saves with short
 * codes; this helper accepts either so the renderer doesn't branch.
 */
function normalizeSteepKeys(
  s: SteepBlock | Record<string, unknown> | undefined,
): SteepBlock {
  if (!s) return {};
  const src = s as Record<string, unknown>;
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = src[k];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    return undefined;
  };
  const out: SteepBlock = {};
  const S = pick('S', 'social', 'Social');
  const T = pick('T', 'technological', 'Technological', 'tecnológico', 'tecnologico');
  const E = pick('E', 'economic', 'Economic', 'económico', 'economico');
  const ENV = pick('ENV', 'environmental', 'Environmental', 'medioambiental');
  const P = pick('P', 'political', 'Political', 'político', 'politico');
  if (S) out.S = S;
  if (T) out.T = T;
  if (E) out.E = E;
  if (ENV) out.ENV = ENV;
  if (P) out.P = P;
  return out;
}

/* ── Page-tracking + TOC ──────────────────────────────────────────── */

interface TocEntry {
  num: string; // "01", "02", …
  title: string;
  page: number; // pre-shift page number
  color: string;
}

const tocEntries: TocEntry[] = [];

function recordSection(doc: jsPDF, title: string, color = GOLD) {
  const num = String(tocEntries.length + 1).padStart(2, '0');
  const page = (doc.getCurrentPageInfo() as { pageNumber: number }).pageNumber;
  tocEntries.push({ num, title, page, color });
  return num;
}

/**
 * Running head drawn at the top of every non-cover, non-TOC page —
 * gold "FUTUROS" wordmark left, report title right, with a thin
 * rule below. Called when sections add a fresh page.
 */
function drawRunningHead(doc: jsPDF, reportTitle?: string) {
  setText(doc, GOLD, 7.5, 'bold', FONT_MONO);
  doc.text('FUTUROS', MARGIN_X, 14);
  if (reportTitle) {
    setText(doc, INK_MUTE, 7.5, 'normal', FONT_MONO);
    const clip = reportTitle.length > 60 ? reportTitle.slice(0, 57) + '…' : reportTitle;
    const w = doc.getTextWidth(clip);
    doc.text(clip, PAGE_W - MARGIN_X - w, 14);
  }
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_X, 17, PAGE_W - MARGIN_X, 17);
}

/* ── Section: Cover ───────────────────────────────────────────────── */

function renderCover(doc: jsPDF, report: ReportResponse, result: ResultData | null, cp: CompanyProfile) {
  paintBackground(doc);
  const en = isEnLang();

  // ── Masthead (top strip) ───────────────────────────────────────
  // Big mono wordmark on the left, issue/edition labels on the right.
  setText(doc, GOLD, 11, 'bold', FONT_MONO);
  doc.text('FUTUROS', MARGIN_X, MARGIN_TOP);
  setText(doc, INK_MUTE, 7.5, 'normal', FONT_MONO);
  doc.text(
    (en ? 'Strategic Foresight' : 'Foresight Estratégico').toUpperCase(),
    MARGIN_X,
    MARGIN_TOP + 5,
  );

  // Issue meta in the top-right.
  const lang = en ? 'en-GB' : 'es-ES';
  const dateStr = new Date(report.createdAt).toLocaleDateString(lang, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  setText(doc, INK_MUTE, 7.5, 'bold', FONT_MONO);
  doc.text((en ? 'Edition' : 'Edición').toUpperCase(), PAGE_W - MARGIN_X, MARGIN_TOP, {
    align: 'right',
  });
  setText(doc, INK, 9, 'normal', FONT_MONO);
  doc.text(dateStr.toUpperCase(), PAGE_W - MARGIN_X, MARGIN_TOP + 5, { align: 'right' });

  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.6);
  doc.line(MARGIN_X, MARGIN_TOP + 9, PAGE_W - MARGIN_X, MARGIN_TOP + 9);

  // Section tag below the rule, far-right
  if (cp.sector) {
    setText(doc, GOLD, 7.5, 'bold', FONT_MONO);
    doc.text(cp.sector.toUpperCase(), PAGE_W - MARGIN_X, MARGIN_TOP + 14, { align: 'right' });
  }

  // ── Hero (centre block) ────────────────────────────────────────
  // Vertical anchor a bit above mid-page so the title and standfirst
  // share the upper-middle visual weight.
  const heroY = 84;
  setText(doc, GOLD, 9.5, 'bold', FONT_MONO);
  doc.text(tx('report.eyebrow', 'Strategic foresight report').toUpperCase(), MARGIN_X, heroY);

  // Title — Playfair display, large. Auto-shrink for very long titles.
  let titleSize = 46;
  let titleLines: string[] = [];
  for (;;) {
    setText(doc, INK, titleSize, 'bold', FONT_SERIF);
    titleLines = doc.splitTextToSize(report.title, CONTENT_W) as string[];
    if (titleLines.length <= 3 || titleSize <= 28) break;
    titleSize -= 4;
  }
  let y = heroY + 16;
  setText(doc, INK, titleSize, 'bold', FONT_SERIF);
  const titleLeading = titleSize * 0.92;
  for (const ln of titleLines) {
    doc.text(ln, MARGIN_X, y);
    y += titleLeading * 0.45;
  }
  y += titleLeading * 0.55;

  // Short gold rule under the title
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.6);
  doc.line(MARGIN_X, y, MARGIN_X + 30, y);
  y += 12;

  // Standfirst / deck — short, capped to ~4 lines so it can't push
  // into the stats strip. Falls back to the strategic challenge.
  const deck = pickCoverDeck(result, cp, en);
  if (deck) {
    y = standfirst(doc, MARGIN_X, y, CONTENT_W * 0.88, deck, {
      size: 13.5,
      color: INK_SOFT,
      leading: 7.6,
    });
    y += 4;
  }

  // ── Quick-stats strip — anchored to the bottom block so it doesn't
  //    collide with the standfirst, regardless of deck length.
  const stats = collectCoverStats(report, result, cp, en);
  if (stats.length > 0) {
    // Stats sit ~46mm above the bottom-of-page consultant/colophon
    // row. PAGE_H - 46 = 251mm. Always below the standfirst (which
    // we capped above), and well clear of the bottom byline at 270.
    const statsY = Math.max(y + 30, PAGE_H - 60);
    doc.setDrawColor(LINE_STRONG);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, statsY - 12, PAGE_W - MARGIN_X, statsY - 12);
    const colW = CONTENT_W / stats.length;
    for (let i = 0; i < stats.length; i++) {
      const x = MARGIN_X + i * colW;
      setText(doc, INK, 24, 'bold', FONT_SERIF);
      doc.text(stats[i].value, x, statsY);
      setText(doc, INK_MUTE, 7.5, 'bold', FONT_MONO);
      doc.text(stats[i].label.toUpperCase(), x, statsY + 4.8);
    }
    doc.setDrawColor(LINE_STRONG);
    doc.line(MARGIN_X, statsY + 12, PAGE_W - MARGIN_X, statsY + 12);
  }

  // ── Bottom block: consultant + colophon ────────────────────────
  if (cp.consultantName || cp.consultantCompany) {
    const consultant = [cp.consultantName, cp.consultantCompany].filter(Boolean).join(' — ');
    setText(doc, INK_MUTE, 7.5, 'bold', FONT_MONO);
    doc.text((en ? 'Prepared by' : 'Preparado por').toUpperCase(), MARGIN_X, PAGE_H - 30);
    setText(doc, INK_SOFT, 13, 'italic', FONT_SERIF);
    doc.text(consultant, MARGIN_X, PAGE_H - 22);
  }
  if (cp.horizon) {
    setText(doc, INK_MUTE, 7.5, 'bold', FONT_MONO);
    doc.text(
      (en ? 'Horizon' : 'Horizonte').toUpperCase(),
      PAGE_W - MARGIN_X,
      PAGE_H - 30,
      { align: 'right' },
    );
    setText(doc, INK, 13, 'normal', FONT_SANS);
    doc.text(
      `${cp.horizon} ${en ? 'years' : 'años'}`,
      PAGE_W - MARGIN_X,
      PAGE_H - 22,
      { align: 'right' },
    );
  }
  setText(doc, INK_FAINT, 7, 'normal', FONT_MONO);
  doc.text(
    (en ? 'Generated with Claude AI' : 'Generado con Claude AI').toUpperCase(),
    MARGIN_X,
    PAGE_H - 10,
  );
  doc.text(
    (en ? 'No. 01' : 'Núm. 01').toUpperCase(),
    PAGE_W - MARGIN_X,
    PAGE_H - 10,
    { align: 'right' },
  );
}

function pickCoverDeck(result: ResultData | null, cp: CompanyProfile, en: boolean): string | null {
  if (result?.executiveSummary) {
    const first = result.executiveSummary
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/)[0];
    if (first && first.length > 40 && first.length < 260) return first.trim();
  }
  if (cp.challenge) return cp.challenge;
  return en
    ? 'A strategic foresight study across plausible futures.'
    : 'Un estudio de foresight estratégico a través de futuros plausibles.';
}

function collectCoverStats(
  _report: ReportResponse,
  result: ResultData | null,
  _cp: CompanyProfile,
  en: boolean,
): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const scenarioCount = result?.scenarios?.length ?? 0;
  if (scenarioCount > 0) {
    out.push({
      value: String(scenarioCount),
      label: en ? 'Scenarios' : 'Escenarios',
    });
  }
  const forcesCount = result?.scenarioPlanning?.drivingForces?.length ?? 0;
  if (forcesCount > 0) {
    out.push({
      value: String(forcesCount),
      label: en ? 'Driving forces' : 'Fuerzas motrices',
    });
  }
  // Sources count — sum across globalSteep + bySection (or fall back).
  const src = result?.sources;
  let sourcesTotal = 0;
  if (src) {
    sourcesTotal += src.globalSteep?.length ?? 0;
    if (src.bySection) {
      for (const k of Object.keys(src.bySection) as Array<'A' | 'B' | 'C' | 'D' | 'E'>) {
        sourcesTotal += src.bySection[k]?.length ?? 0;
      }
    } else {
      sourcesTotal += src.report?.length ?? src.sources?.length ?? 0;
    }
  }
  if (sourcesTotal > 0) {
    out.push({
      value: String(sourcesTotal),
      label: en ? 'Sources cited' : 'Fuentes citadas',
    });
  }
  return out.slice(0, 3);
}

/* ── Section: Table of Contents ───────────────────────────────────── */

/**
 * Reserve a placeholder TOC page right after the cover. We fill it in
 * at the end of rendering, when we know each section's page number.
 */
function reserveTocPage(doc: jsPDF): number {
  doc.addPage();
  paintBackground(doc);
  // The returned page number is the slot we'll fill later.
  return (doc.getCurrentPageInfo() as { pageNumber: number }).pageNumber;
}

/**
 * Magazine-style contents page. Each entry is a 2-column row:
 *  - Left ~70%: big serif index + title + small italic teaser
 *  - Right ~30%: page number in serif display + thin rule
 *
 * Designed to feel like the contents page of an editorial quarterly —
 * not a CLI-style "Title ........... 12" list.
 */
function renderToc(
  doc: jsPDF,
  tocPageNum: number,
  shift: number,
  reportTitle: string,
  teasers: Record<string, string>,
) {
  doc.setPage(tocPageNum);
  drawRunningHead(doc, reportTitle);
  const en = isEnLang();

  // Editorial top block: kicker + "Contents" headline (compact so the
  // whole TOC — 10 entries plus chrome — fits on the reserved page).
  let y = MARGIN_TOP + 8;
  kicker(doc, MARGIN_X, y, en ? 'Inside this report' : 'Dentro de este informe', GOLD, 8);
  y += 8;
  setText(doc, INK, 28, 'bold', FONT_SERIF);
  doc.text(en ? 'Contents' : 'Contenidos', MARGIN_X, y + 12);
  y += 18;
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  y += 10;

  // Entries — single-line layout per entry: NN | Title (teaser as
  // small italic continuation on the same row) | Page #. Capped to
  // ~17mm per entry so all 10 fit in the 220mm content area.
  const entryH = 17;
  const pageColW = 22;
  const textColW = CONTENT_W - pageColW - 6;
  for (const e of tocEntries) {
    const shifted = e.page + shift;
    const entryTopY = y - 4;
    // Numeral — neutral mute tone so the index reads as a quiet
    // typographic list rather than a coloured palette.
    setText(doc, INK_MUTE, 16, 'bold', FONT_SERIF);
    doc.text(e.num, MARGIN_X, y + 4);
    // Title — display serif, 13pt, one line max
    const titleX = MARGIN_X + 14;
    setText(doc, INK, 13, 'bold', FONT_SERIF);
    const titleMaxW = textColW - 14;
    doc.text(clipText(doc, e.title, titleMaxW), titleX, y + 3);
    // Teaser — small italic, one line max
    const teaser = teasers[e.num];
    if (teaser) {
      setText(doc, INK_SOFT, 8.5, 'italic', FONT_SERIF);
      doc.text(clipText(doc, teaser, titleMaxW), titleX, y + 10);
    }
    // Page number on the right
    setText(doc, INK, 18, 'normal', FONT_SERIF);
    const pageStr = String(shifted);
    const pageW = doc.getTextWidth(pageStr);
    doc.text(pageStr, PAGE_W - MARGIN_X - pageW, y + 5);
    // Thin rule between entries
    y += entryH;
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.15);
    doc.line(MARGIN_X, y - 3, PAGE_W - MARGIN_X, y - 3);
    // Whole-row link annotation
    doc.link(MARGIN_X, entryTopY, CONTENT_W, entryH, {
      pageNumber: shifted,
    });
  }

  // Footer credit
  setText(doc, INK_FAINT, 7, 'normal', FONT_MONO);
  doc.text(
    (en ? 'Read in the order shown' : 'Leer en el orden mostrado').toUpperCase(),
    MARGIN_X,
    PAGE_H - 28,
  );
}

/**
 * Build per-section teasers shown next to the TOC entries. Keyed by
 * the entry's two-digit numeral string ("01", "02", …). Pulls from
 * the data where possible (first sentence of exec summary, scenario
 * names, etc.) so the contents page reads like a magazine spread.
 */
function buildTocTeasers(
  result: ResultData | null,
  input: InputData,
  en: boolean,
): Record<string, string> {
  const teasers: Record<string, string> = {};
  // Tracks idx in lockstep with the section push order in
  // `exportReportPdf` — every block must check the same availability
  // conditions as the renderer for the indices to line up.
  let idx = 1;
  const put = (text: string) => {
    teasers[String(idx).padStart(2, '0')] = text;
    idx++;
  };

  // 01: Brief — pushed whenever the brief+exec spread renders.
  if (result?.executiveSummary || input.companyProfile) {
    put(
      en
        ? 'Organisation, sector, challenge and capabilities at a glance.'
        : 'Organización, sector, reto y capacidades de un vistazo.',
    );
    // 02: Executive summary — same spread but its own TOC entry.
    if (result?.executiveSummary) {
      const first = result.executiveSummary
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/)[0];
      put(
        first && first.length < 220
          ? first
          : en
            ? 'The lead narrative — what the analysis means for this organisation.'
            : 'La narrativa principal — qué significa este análisis para la organización.',
      );
    }
  }

  // 03: STEEP
  const hasGlobal =
    !!input.globalSteep &&
    Object.values(input.globalSteep).some((v) => (v ?? '').trim().length > 0);
  const hasSect =
    !!input.steep && Object.values(input.steep).some((v) => (v ?? '').trim().length > 0);
  if (hasGlobal || hasSect) {
    put(
      en
        ? 'Five-dimension scan of the global and sectorial context.'
        : 'Escaneo en cinco dimensiones del contexto global y sectorial.',
    );
  }

  // 04: Key uncertainties
  if (result?.keyUncertainties?.length) {
    const n = result.keyUncertainties.length;
    put(
      en
        ? `${n} open questions that shape what futures are possible.`
        : `${n} preguntas abiertas que delimitan los futuros posibles.`,
    );
  }

  // 05: 3P Scenarios
  if (result?.scenarios?.length) {
    const names = result.scenarios.map((s) => s.name ?? s.title ?? '').filter(Boolean);
    put(
      names.length > 0
        ? names.slice(0, 3).join(' · ')
        : en
          ? 'Probable, plausible and possible futures explored in depth.'
          : 'Futuros probable, plausible y posible explorados en profundidad.',
    );
  }

  // 06: Scenario Planning
  if (
    result?.scenarioPlanning &&
    ((result.scenarioPlanning.drivingForces?.length ?? 0) > 0 ||
      (result.scenarioPlanning.axes?.length ?? 0) > 0 ||
      (result.scenarioPlanning.scenarioLogics?.length ?? 0) > 0)
  ) {
    const fc = result.scenarioPlanning.drivingForces?.length ?? 0;
    const ac = result.scenarioPlanning.axes?.length ?? 0;
    put(
      en
        ? `${fc} driving forces, ${ac} uncertainty axes, and the narrative logic linking them.`
        : `${fc} fuerzas motrices, ${ac} ejes de incertidumbre y la lógica narrativa que los conecta.`,
    );
  }

  // 07: Backcasting
  if (result?.backcasting?.length) {
    const total = result.backcasting.reduce(
      (n, e) => n + (e.milestones?.length ?? 0),
      0,
    );
    put(
      en
        ? `${total} milestones traced back from each scenario's vision.`
        : `${total} hitos trazados desde la visión de cada escenario.`,
    );
  }

  // 08: Strategic map
  if (result?.strategicMap?.length) {
    const n = result.strategicMap.length;
    put(
      en
        ? `${n} priorities laid out across the H1 / H2 / H3 horizons.`
        : `${n} prioridades distribuidas en los horizontes H1 / H2 / H3.`,
    );
  }

  // 09: Signals & wildcards
  if ((result?.weakSignals?.length ?? 0) > 0 || (result?.wildcards?.length ?? 0) > 0) {
    const sn = result?.weakSignals?.length ?? 0;
    const wn = result?.wildcards?.length ?? 0;
    put(
      en
        ? `${sn} weak signals and ${wn} wildcards — the edge cases to watch.`
        : `${sn} señales débiles y ${wn} wildcards — los casos límite a vigilar.`,
    );
  }

  // 10: Sources
  if (
    result?.sources &&
    ((result.sources.sources?.length ?? 0) > 0 ||
      (result.sources.report?.length ?? 0) > 0 ||
      (result.sources.globalSteep?.length ?? 0) > 0 ||
      (result.sources.bySection &&
        Object.values(result.sources.bySection).some((v) => (v?.length ?? 0) > 0)))
  ) {
    put(
      en
        ? 'Public sources consulted via web search during generation.'
        : 'Fuentes públicas consultadas mediante búsqueda web durante la generación.',
    );
  }
  return teasers;
}

function clipText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  const ellipsis = '…';
  let lo = 1;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (doc.getTextWidth(text.slice(0, mid) + ellipsis) <= maxWidth) lo = mid + 1;
    else hi = mid;
  }
  return text.slice(0, Math.max(1, lo - 1)) + ellipsis;
}

/* ── Section: Organisation Profile ────────────────────────────────── */

/**
 * Combined Brief + Executive Summary "opening spread" — magazine
 * convention where the lead feature occupies the right 2/3 and a
 * narrow "BRIEF" sidebar on the left 1/3 gives the at-a-glance org
 * context. Saves a page over rendering them separately and reads
 * like the opening of a feature article.
 */
function renderBriefAndExec(
  doc: jsPDF,
  input: InputData,
  exec: string | undefined,
): number {
  let y = addPage(doc);
  drawRunningHead(doc);
  const en = isEnLang();
  const cp = input.companyProfile ?? {};

  // Record both sections in the TOC pointing at this page.
  const briefNum = String(tocEntries.length + 1).padStart(2, '0');
  const page = (doc.getCurrentPageInfo() as { pageNumber: number }).pageNumber;
  tocEntries.push({
    num: briefNum,
    title: en ? 'Brief' : 'Brief',
    page,
    color: GOLD,
  });
  if (exec) {
    const execNum = String(tocEntries.length + 1).padStart(2, '0');
    tocEntries.push({
      num: execNum,
      title: tx('report.results.summary.execTitle', 'Executive summary'),
      page,
      color: GOLD,
    });
  }

  // Layout columns
  const sidebarW = CONTENT_W * 0.32;
  const gap = 8;
  const mainW = CONTENT_W - sidebarW - gap;
  const sidebarX = MARGIN_X;
  const mainX = MARGIN_X + sidebarW + gap;
  const startY = y + 4;

  // ── Sidebar (BRIEF) ────────────────────────────────────────────
  let sy = startY;
  setText(doc, GOLD, 22, 'bold', FONT_SERIF);
  doc.text(briefNum, sidebarX, sy + 4);
  setText(doc, INK_MUTE, 7, 'bold', FONT_MONO);
  doc.text((en ? 'Brief' : 'Brief').toUpperCase(), sidebarX, sy + 11);
  sy += 22;
  // Gold short rule
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.4);
  doc.line(sidebarX, sy, sidebarX + 14, sy);
  sy += 8;

  const sidebarRow = (label: string, value: string | undefined) => {
    if (!value) return;
    setText(doc, INK_MUTE, 6.8, 'bold', FONT_MONO);
    doc.text(label.toUpperCase(), sidebarX, sy);
    sy += 4;
    setText(doc, INK, 11, 'bold', FONT_SERIF);
    const lines = doc.splitTextToSize(value, sidebarW) as string[];
    for (const ln of lines) {
      doc.text(ln, sidebarX, sy);
      sy += 5.4;
    }
    sy += 4;
  };
  sidebarRow(en ? 'Organisation' : 'Organización', cp.name);
  sidebarRow(en ? 'Sector' : 'Sector', cp.sector);
  if (cp.horizon) {
    sidebarRow(en ? 'Horizon' : 'Horizonte', `${cp.horizon} ${en ? 'years' : 'años'}`);
  }
  // Challenge as body text
  if (cp.challenge) {
    setText(doc, INK_MUTE, 6.8, 'bold', FONT_MONO);
    doc.text((en ? 'Challenge' : 'Reto').toUpperCase(), sidebarX, sy);
    sy += 4;
    sy = body(doc, sy, cp.challenge, {
      indent: sidebarX,
      maxWidth: sidebarW,
      color: INK_SOFT,
      size: 9.5,
      leading: 5,
      trailingGap: 4,
    });
  }
  if (cp.strengths) {
    setText(doc, INK_MUTE, 6.8, 'bold', FONT_MONO);
    doc.text((en ? 'Strengths' : 'Capacidades').toUpperCase(), sidebarX, sy);
    sy += 4;
    sy = body(doc, sy, cp.strengths, {
      indent: sidebarX,
      maxWidth: sidebarW,
      color: INK_SOFT,
      size: 9.5,
      leading: 5,
      trailingGap: 4,
    });
  }
  if (cp.consultantName || cp.consultantCompany) {
    const consultant = [cp.consultantName, cp.consultantCompany].filter(Boolean).join(' — ');
    setText(doc, INK_MUTE, 6.8, 'bold', FONT_MONO);
    doc.text((en ? 'Consultant' : 'Consultor').toUpperCase(), sidebarX, sy);
    sy += 4;
    setText(doc, INK_SOFT, 10, 'italic', FONT_SERIF);
    const lines = doc.splitTextToSize(consultant, sidebarW) as string[];
    for (const ln of lines) {
      doc.text(ln, sidebarX, sy);
      sy += 5.2;
    }
  }

  // Vertical hairline between sidebar and main column
  doc.setDrawColor(LINE_STRONG);
  doc.setLineWidth(0.2);
  const divX = mainX - gap / 2;
  doc.line(divX, startY, divX, Math.max(sy, startY + 40));

  // ── Main (EXECUTIVE SUMMARY) ───────────────────────────────────
  let my = startY;
  if (exec) {
    const execNum = String(tocEntries.length).padStart(2, '0'); // already pushed
    setText(doc, GOLD, 22, 'bold', FONT_SERIF);
    doc.text(execNum, mainX, my + 4);
    setText(doc, INK_MUTE, 7, 'bold', FONT_MONO);
    doc.text(
      (en ? 'Lead' : 'Líder').toUpperCase(),
      mainX,
      my + 11,
    );
    my += 18;
    setText(doc, INK, 26, 'bold', FONT_SERIF);
    const titleLines = doc.splitTextToSize(
      tx('report.results.summary.execTitle', 'Executive summary'),
      mainW,
    ) as string[];
    for (const ln of titleLines) {
      doc.text(ln, mainX, my + 8);
      my += 10;
    }
    my += 2;
    doc.setDrawColor(GOLD);
    doc.setLineWidth(0.6);
    doc.line(mainX, my, mainX + 22, my);
    my += 8;

    // Lead paragraph as standfirst (italic serif)
    const paragraphs = exec.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length > 0) {
      my = standfirst(doc, mainX, my, mainW, paragraphs[0], {
        size: 12.5,
        color: INK,
        leading: 7,
      });
      my += 4;
    }
    // Subsequent paragraphs as serif body
    for (let i = 1; i < paragraphs.length; i++) {
      my = body(doc, my, paragraphs[i], {
        indent: mainX,
        maxWidth: mainW,
        color: INK_SOFT,
        size: 10.5,
        family: FONT_SERIF,
        leading: 5.8,
        trailingGap: 3.5,
      });
    }
    // Optional pull quote near the bottom of the column
    if (paragraphs.length >= 2) {
      const pq = extractPullQuote(paragraphs.slice(1).join(' '));
      if (pq) {
        // Render the pull quote in the sidebar area (margin pull quote)
        renderMarginPullQuote(doc, sidebarX, Math.max(sy + 10, my + 6), sidebarW, pq);
      }
    }
  }

  return Math.max(sy, my) + 8;
}

/**
 * Marginal pull quote — magazine-style italic serif quote anchored in
 * the sidebar column. Used for the executive-summary spread when the
 * sidebar has run out of structured content. The bar at the start is
 * gold for accent continuity.
 */
function renderMarginPullQuote(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  text: string,
) {
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.6);
  doc.line(x, y, x + 12, y);
  y += 7;
  setText(doc, INK, 12, 'italic', FONT_SERIF);
  const lines = doc.splitTextToSize(`"${text}"`, w) as string[];
  for (const ln of lines.slice(0, 6)) {
    if (y + 6 > PAGE_BOTTOM) break;
    doc.text(ln, x, y);
    y += 6;
  }
}

/**
 * Heuristic pull-quote selector — pick the first sentence between 60
 * and 160 characters that doesn't start with a connector. Keeps the
 * pull quote feeling editorial rather than mechanical.
 */
function extractPullQuote(text: string): string | null {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/);
  for (const s of sentences) {
    const trimmed = s.trim();
    if (trimmed.length < 60 || trimmed.length > 160) continue;
    if (/^(además|también|pero|sin embargo|moreover|also|however|but)\b/i.test(trimmed)) continue;
    // Strip trailing period for tighter quote look.
    return trimmed.replace(/[.,;:]+$/, '');
  }
  return null;
}

/* ── Section: STEEP Inputs ────────────────────────────────────────── */

/**
 * STEEP context — magazine-style 2-column grid. Five dimension cards
 * per block (global + sectorial), laid out as 2 columns × N rows
 * inside the in-page section. Stacks the two blocks vertically with
 * a small "GLOBAL · SECTORIAL" intertitle in between.
 */
function renderSteepInputs(doc: jsPDF, yIn: number, input: InputData): number {
  const g = normalizeSteepKeys(input.globalSteep);
  const s = normalizeSteepKeys(input.steep);
  const dims: Array<'S' | 'T' | 'E' | 'ENV' | 'P'> = ['S', 'T', 'E', 'ENV', 'P'];
  const hasGlobal = dims.some((k) => (g[k] ?? '').trim().length > 0);
  const hasSect = dims.some((k) => (s[k] ?? '').trim().length > 0);
  if (!hasGlobal && !hasSect) return yIn;

  let y = pageHeader(
    doc,
    yIn,
    tx('report.results.steep.title', 'STEEP analysis'),
    isEnLang() ? 'Context' : 'Contexto',
    GOLD,
  );

  if (hasGlobal) {
    y = sectionLabel(doc, y, tx('report.results.steep.global', 'Global'));
    y = renderSteepGrid(doc, y, g, dims);
    y += 6;
  }
  if (hasSect) {
    y = sectionLabel(doc, y, tx('report.results.steep.sectorial', 'Sectorial'));
    y = renderSteepGrid(doc, y, s, dims);
  }
  return y;
}

/**
 * Renders a STEEP block as a sequence of compact "header + body"
 * rows. Each dimension gets a colour-coded letter badge + label, then
 * its description flows as line-paginated body text. Drops the
 * fixed-height card pattern which orphaned the page header when a
 * single dimension's text exceeded one card height.
 */
function renderSteepGrid(
  doc: jsPDF,
  yIn: number,
  block: SteepBlock,
  dims: Array<'S' | 'T' | 'E' | 'ENV' | 'P'>,
): number {
  let y = yIn;
  const filled = dims.filter((k) => (block[k] ?? '').trim().length > 0);
  for (let i = 0; i < filled.length; i++) {
    const k = filled[i];
    const value = (block[k] ?? '').trim();
    y = renderSteepRow(doc, y, k, value);
    if (i < filled.length - 1) y += 3;
  }
  return y;
}

/**
 * One STEEP dimension as a compact row — letter badge + label on the
 * first line, description flowing at body size below. Body paginates
 * line-by-line via `body()`, so verbose dimensions don't break the
 * page in inconvenient places.
 */
function renderSteepRow(
  doc: jsPDF,
  yIn: number,
  k: 'S' | 'T' | 'E' | 'ENV' | 'P',
  value: string,
): number {
  // Reserve enough space to render at least the badge + label + a few
  // lines of body. If we can't, paginate first so the heading stays
  // attached to its content.
  let y = checkY(doc, yIn, 28);
  const { fg, bg } = steepColor(k);
  // Letter badge
  doc.setFillColor(bg);
  doc.roundedRect(MARGIN_X, y - 4, 8, 8, 1.4, 1.4, 'F');
  setText(doc, fg, 8.5, 'bold', FONT_MONO);
  const lw = doc.getTextWidth(k);
  doc.text(k, MARGIN_X + 4 - lw / 2, y + 1.5);
  // Label
  setText(doc, INK, 11, 'bold', FONT_SANS);
  doc.text(steepLabel(k), MARGIN_X + 12, y + 1);
  // Description — flowing body, line-paginates naturally
  y += 6;
  y = body(doc, y, value, {
    indent: MARGIN_X + 12,
    maxWidth: CONTENT_W - 12,
    color: INK_SOFT,
    size: 9.5,
    leading: 4.8,
    paragraphGap: 2.5,
    trailingGap: 2,
  });
  return y;
}

/* ── Section: Key Uncertainties ───────────────────────────────────── */

/**
 * Key uncertainties — 2-column grid of "questions". Each question
 * gets a giant gold numeral as a display element, a short serif
 * headline (the uncertainty name), and a compact body description.
 * Reads like an interview-style "questions we're asking" feature.
 */
function renderUncertainties(doc: jsPDF, yIn: number, items: KeyUncertainty[]): number {
  let y = pageHeader(
    doc,
    yIn,
    tx('report.results.uncertainties', 'Key uncertainties'),
    isEnLang() ? 'Open questions' : 'Preguntas abiertas',
    GOLD,
  );
  const gap = 6;
  const colW = (CONTENT_W - gap) / 2;
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    const heights = pair.map((u) => measureUncertaintyCard(doc, u, colW));
    const rowH = Math.max(...heights);
    y = checkY(doc, y, rowH + 4);
    pair.forEach((u, idx) => {
      const x = MARGIN_X + idx * (colW + gap);
      drawUncertaintyCard(doc, x, y, colW, rowH, u, i + idx);
    });
    y += rowH + 5;
    // Thin rule between rows for editorial cadence
    if (i + 2 < items.length) {
      doc.setDrawColor(LINE);
      doc.setLineWidth(0.15);
      doc.line(MARGIN_X, y - 2.5, PAGE_W - MARGIN_X, y - 2.5);
      y += 1;
    }
  }
  return y + 2;
}

function measureUncertaintyCard(doc: jsPDF, u: KeyUncertainty, w: number): number {
  const titleW = w - 12;
  setText(doc, INK, 11.5, 'bold', FONT_SERIF);
  const titleLines = doc.splitTextToSize(u.name, titleW) as string[];
  const titleH = titleLines.length * 5.6;
  const descH = u.description
    ? measureBody(doc, u.description, { size: 9, family: FONT_SANS, maxWidth: titleW, leading: 4.7 })
    : 0;
  return Math.max(titleH + descH + 5, 20);
}

function drawUncertaintyCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  _h: number,
  u: KeyUncertainty,
  idx: number,
) {
  const numStr = String(idx + 1).padStart(2, '0');
  // Compact gold numeral
  setText(doc, GOLD, 22, 'bold', FONT_SERIF);
  doc.text(numStr, x, y + 7);
  // Title
  const titleX = x + 12;
  const titleW = w - 12;
  setText(doc, INK, 11.5, 'bold', FONT_SERIF);
  const titleLines = doc.splitTextToSize(u.name, titleW) as string[];
  let ty = y + 4;
  for (const ln of titleLines) {
    doc.text(ln, titleX, ty);
    ty += 5.6;
  }
  if (u.description) {
    body(doc, ty, u.description, {
      indent: titleX,
      maxWidth: titleW,
      color: INK_SOFT,
      size: 9,
      leading: 4.7,
      trailingGap: 0,
    });
  }
}

/* ── Section: 3P Scenarios ────────────────────────────────────────── */

function renderScenarios(doc: jsPDF, scenarios: Scenario[]): number {
  // No standalone "section opener" page — each scenario IS the
  // feature spread, and 3 spreads is enough section identity. Saves
  // 1-2 pages and avoids the "empty title page" symptom.
  let y = 0;
  for (let i = 0; i < scenarios.length; i++) {
    y = addPage(doc);
    drawRunningHead(doc);
    if (i === 0) {
      // First scenario page records the "3P Scenarios" TOC entry so
      // the section is still indexed.
      recordSection(doc, tx('report.results.tabs.scenarios', '3P Scenarios'), GREEN);
    }
    y = renderScenarioFeature(doc, y, scenarios[i], i);
  }
  return y;
}

/**
 * Editorial "scenario feature" — each 3P scenario gets a dedicated
 * page that opens with the TYPE pill, a large probability lock-up,
 * the scenario name in display serif, the descriptive lead, then a
 * three-block action grid (opportunities / threats / success
 * factors) and a gold-stripe first-move callout.
 */
/**
 * Editorial feature page for a single 3P scenario.
 *
 * Layout:
 * - Header row: TYPE pill on the left, scenario number ("01") on the
 *   right.
 * - Headline block: Scenario name in massive Playfair (auto-sized to
 *   fit) over a gold rule.
 * - Standfirst block: italic serif first sentence as a deck.
 * - Hero stat: huge probability number in serif display with mini bar
 *   meter and label, set against the body's flowing column.
 * - 2-column main body: description split into columns for editorial
 *   density.
 * - Action sidebar at the bottom: three small list blocks (opps /
 *   threats / success) in a row.
 * - First-move pull-out: gold-stripe callout occupying the full width.
 */
function renderScenarioFeature(doc: jsPDF, yIn: number, s: Scenario, idx: number): number {
  const colors = scenarioColors(s.type, idx);
  const pct = parsePercent(s.probability);
  const en = isEnLang();

  // ── Top row ────────────────────────────────────────────────────
  pill(doc, MARGIN_X, yIn + 5, s.type ?? '', colors.fg, colors.bg);
  // Scenario number on the right — compact
  setText(doc, colors.fg, 20, 'bold', FONT_SERIF);
  const numStr = String(idx + 1).padStart(2, '0');
  const nw = doc.getTextWidth(numStr);
  doc.text(numStr, PAGE_W - MARGIN_X - nw, yIn + 8);
  setText(doc, INK_MUTE, 6.5, 'bold', FONT_MONO);
  doc.text(
    (en ? 'Scenario' : 'Escenario').toUpperCase(),
    PAGE_W - MARGIN_X - nw,
    yIn + 12,
  );
  let y = yIn + 18;

  // ── Headline — auto-shrink so we keep <=2 lines and tighter leading
  let titleSize = 30;
  let titleLines: string[] = [];
  for (;;) {
    setText(doc, INK, titleSize, 'bold', FONT_SERIF);
    titleLines = doc.splitTextToSize(s.name ?? s.title ?? '', CONTENT_W) as string[];
    if (titleLines.length <= 2 || titleSize <= 20) break;
    titleSize -= 2;
  }
  setText(doc, INK, titleSize, 'bold', FONT_SERIF);
  for (const ln of titleLines) {
    y = checkY(doc, y, titleSize * 0.45);
    doc.text(ln, MARGIN_X, y + titleSize * 0.3);
    y += titleSize * 0.42;
  }
  y += 3;
  doc.setDrawColor(colors.fg);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_X, y, MARGIN_X + 24, y);
  y += 6;

  // ── Standfirst + hero probability stat in a 2-column row ──────
  const descParts = (s.description ?? '').trim();
  const firstSentence = descParts
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/)[0];
  const rest = descParts.slice(firstSentence.length).trim();

  if (s.probability) {
    // Stat block top-right
    const statW = 50;
    const statX = PAGE_W - MARGIN_X - statW;
    const heroTop = y;
    setText(doc, INK_MUTE, 6.5, 'bold', FONT_MONO);
    doc.text(
      tx('report.results.scen.probability', 'Probability').toUpperCase(),
      statX,
      heroTop + 3,
    );
    setText(doc, colors.fg, 28, 'bold', FONT_SERIF);
    doc.text(s.probability, statX, heroTop + 18);
    bar(doc, statX, heroTop + 21, statW, pct, colors.fg);
    setText(doc, INK_MUTE, 6, 'normal', FONT_MONO);
    doc.text(
      (en ? 'Model likelihood' : 'Probabilidad').toUpperCase(),
      statX,
      heroTop + 26,
    );
    // Standfirst flows in the left 65%
    if (firstSentence) {
      const standfirstW = CONTENT_W - statW - 8;
      y = standfirst(doc, MARGIN_X, y, standfirstW, firstSentence, {
        size: 12,
        color: INK,
        leading: 6.6,
      });
    }
    y = Math.max(y, heroTop + 32);
    y += 2;
  } else if (firstSentence) {
    y = standfirst(doc, MARGIN_X, y, CONTENT_W, firstSentence, {
      size: 12,
      color: INK,
      leading: 6.6,
    });
  }

  // ── Body description ──────────────────────────────────────────
  if (rest) {
    y = body(doc, y, rest, {
      indent: MARGIN_X,
      maxWidth: CONTENT_W,
      color: INK_SOFT,
      size: 10,
      family: FONT_SERIF,
      leading: 5.4,
      trailingGap: 5,
    });
  }

  // ── Action sidebar (3 columns, OR stacked when too tall) ──────
  //
  // We pre-measure all 3 columns first. If they fit side-by-side on
  // the current (or a fresh) page, render in parallel — same start-y
  // for each column. If the tallest column would still exceed a page,
  // fall back to a stacked layout that flows + paginates naturally.
  // Without this, dotBullets's per-line pagination inside the first
  // column moves the doc cursor to a new page, and subsequent
  // columns get drawn at the OLD start-y on the NEW page — visually
  // collapsing the 3-col grid into a 1-col layout.
  const lists: Array<[string[] | undefined, string, string]> = [
    [s.opportunities, tx('report.results.scen.opps', 'Opportunities'), GREEN],
    [s.threats, tx('report.results.scen.threats', 'Threats'), RED],
    [s.successFactors, tx('report.results.scen.success', 'Success factors'), GOLD],
  ];
  const cols = lists.filter(([items]) => (items?.length ?? 0) > 0);
  if (cols.length > 0) {
    const colGap = 5;
    const colW = (CONTENT_W - colGap * (cols.length - 1)) / cols.length;
    const colItemSize = 8.5;
    const colItemLeading = 4.4;
    // Measure each column's height for the side-by-side layout.
    const colHeights = cols.map(([items]) => {
      let h = 6; // header row
      for (const it of items ?? []) {
        const lines = doc.splitTextToSize(it, colW - 4) as string[];
        h += lines.length * colItemLeading + 0.4;
      }
      return h + 1;
    });
    const tallestCol = Math.max(...colHeights);
    const headerBlockH = 8; // rule + 6mm
    const availOnPage = PAGE_BOTTOM - y;
    const fitsSideBySide = tallestCol + headerBlockH <= availOnPage;
    const fitsOnFreshPage = tallestCol + headerBlockH <= PAGE_BOTTOM - MARGIN_TOP;

    if (fitsSideBySide || fitsOnFreshPage) {
      if (!fitsSideBySide) {
        y = addPage(doc);
        drawRunningHead(doc);
      } else {
        y += 1;
      }
      doc.setDrawColor(LINE_STRONG);
      doc.setLineWidth(0.2);
      doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
      y += 6;
      const colStartY = y;
      for (let i = 0; i < cols.length; i++) {
        const [items, label, color] = cols[i];
        const colX = MARGIN_X + (colW + colGap) * i;
        let cy = colStartY;
        setText(doc, color, 7, 'bold', FONT_MONO);
        doc.text(label.toUpperCase(), colX, cy);
        doc.setDrawColor(color);
        doc.setLineWidth(0.35);
        doc.line(colX, cy + 1.6, colX + 12, cy + 1.6);
        const count = items?.length ?? 0;
        setText(doc, INK_MUTE, 6.5, 'bold', FONT_MONO);
        doc.text(String(count).padStart(2, '0'), colX + colW - 5, cy);
        cy += 6;
        // Draw bullets directly without checkY — we already verified
        // the column fits. This prevents the mid-render pagination
        // that breaks the side-by-side layout.
        drawBulletsNoPaginate(doc, cy, items ?? [], color, {
          indent: colX,
          maxWidth: colW - 4,
          size: colItemSize,
          leading: colItemLeading,
          textColor: INK_SOFT,
        });
      }
      y = colStartY + tallestCol + 1;
    } else {
      // Stacked fallback — render each block as a horizontal row that
      // paginates naturally if it overflows.
      y = checkY(doc, y + 1, 20);
      doc.setDrawColor(LINE_STRONG);
      doc.setLineWidth(0.2);
      doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
      y += 5;
      for (const [items, label, color] of cols) {
        y = checkY(doc, y, 12);
        setText(doc, color, 7, 'bold', FONT_MONO);
        doc.text(label.toUpperCase(), MARGIN_X, y);
        doc.setDrawColor(color);
        doc.setLineWidth(0.35);
        doc.line(MARGIN_X, y + 1.6, MARGIN_X + 14, y + 1.6);
        y += 6;
        y = dotBullets(doc, y, items ?? [], color, {
          indent: MARGIN_X,
          maxWidth: CONTENT_W - 4,
          size: 9,
          textColor: INK_SOFT,
        });
        y += 2;
      }
    }
  }

  // ── First-move pull-out ───────────────────────────────────────
  if (s.firstMove) {
    y = checkY(doc, y + 1, 20);
    const innerW = CONTENT_W - 14;
    const fmH = measureBody(doc, s.firstMove, { size: 10.5, family: FONT_SANS, maxWidth: innerW, leading: 5.5 }) + 12;
    card(doc, MARGIN_X, y, CONTENT_W, fmH, {
      fill: SURFACE_2,
      border: LINE_ACCENT,
      stripe: GOLD,
    });
    setText(doc, GOLD, 7, 'bold', FONT_MONO);
    doc.text(
      tx('report.results.scen.firstmove', 'First move').toUpperCase(),
      MARGIN_X + 7,
      y + 5.5,
    );
    body(doc, y + 10.5, s.firstMove, {
      indent: MARGIN_X + 7,
      maxWidth: innerW,
      color: INK,
      size: 10.5,
      family: FONT_SANS,
      leading: 5.5,
      trailingGap: 0,
    });
    y += fmH + 3;
  }

  return y;
}

/* ── Section: Scenario Planning ───────────────────────────────────── */

/**
 * Scenario Planning — compact magazine "structure" feature. Opens
 * with an italic standfirst, then a 2×2 grid of driving forces, then
 * a featured 2-column axes spread, then 3 narrow scenario-logic
 * cards in a row. Everything keyed to fit on roughly 1-2 pages.
 */
function renderScenarioPlanning(doc: jsPDF, sp: ScenarioPlanning): number {
  let y = addPage(doc);
  drawRunningHead(doc);
  y = pageHeader(
    doc,
    y,
    tx('report.results.tabs.sp', 'Scenario Planning'),
    isEnLang() ? 'Structure' : 'Estructura',
    BLUE,
  );

  if (sp.intro) {
    y = standfirst(doc, MARGIN_X, y, CONTENT_W, sp.intro, {
      size: 11.5,
      color: INK,
      leading: 6.4,
    });
    y += 4;
  }

  // ── Driving forces — single-column compact rows (no fixed-height
  //    cards that orphaned the header on long descriptions). Each
  //    force flows naturally; pagination is by line. Reserve at
  //    least ~24mm after the label so it doesn't orphan.
  if (sp.drivingForces?.length) {
    y = sectionLabel(doc, y, tx('report.results.sp.forces', 'Driving forces of change'), GOLD, 26);
    const forces = [...sp.drivingForces].sort((a, b) => a.rank - b.rank);
    for (const f of forces) y = renderDrivingForceRow(doc, y, f);
    y += 3;
  }

  // ── Axes — 2-column featured spread ──────────────────────────
  if (sp.axes?.length) {
    const colGap = 8;
    const colW = (CONTENT_W - colGap) / 2;
    const axisHeights = sp.axes.map((ax) => measureAxisCard(doc, ax, colW));
    const axesRowH = Math.max(...axisHeights);
    // Pass the row height so the section label stays glued to the
    // axes cards instead of orphaning at the bottom of the page.
    y = sectionLabel(
      doc,
      y,
      tx('report.results.sp.axesTitle', 'Critical uncertainty axes'),
      GOLD,
      axesRowH + 4,
    );
    sp.axes.forEach((ax, i) => {
      const colX = i === 0 ? MARGIN_X : MARGIN_X + colW + colGap;
      renderAxisCard(doc, colX, y, colW, ax);
    });
    y += axesRowH + 4;
  }

  // ── Scenario logics — stacked full-width cards. A 3-column row
  //    works on screen but in print each card's long logic text
  //    drives the column to many lines, leaving narrow strips that
  //    spill one per page. Stacking gives each logic the full content
  //    width so the description reads in 4-6 lines instead of 28.
  if (sp.scenarioLogics?.length) {
    // Lookahead height for the first logic card so the section label
    // keeps it on the same page.
    const firstLogicH = measureScenarioLogicRow(doc, sp.scenarioLogics[0]);
    y = sectionLabel(
      doc,
      y,
      tx('report.results.sp.logics', 'Narrative logic per scenario'),
      GOLD,
      firstLogicH + 4,
    );
    for (let i = 0; i < sp.scenarioLogics.length; i++) {
      y = renderScenarioLogicRow(doc, y, sp.scenarioLogics[i], i);
    }
  }
  return y;
}

function measureScenarioLogicRow(doc: jsPDF, l: ScenarioLogic): number {
  const innerPad = 6;
  const innerW = CONTENT_W - innerPad * 2;
  const logicH = l.logic
    ? measureBody(doc, l.logic, { size: 10, family: FONT_SANS, maxWidth: innerW - 14, leading: 5.2 })
    : 0;
  return innerPad + 8 + logicH + innerPad - 2;
}

/**
 * Full-width scenario-logic card — coloured numeral + serif name on
 * the same row, narrative logic flowing below at body size. Replaces
 * the 3-column variant that produced tall narrow strips on print.
 */
function renderScenarioLogicRow(
  doc: jsPDF,
  yIn: number,
  l: ScenarioLogic,
  idx: number,
): number {
  const colors = scenarioColors(undefined, idx);
  const innerPad = 6;
  const innerW = CONTENT_W - innerPad * 2;
  const logicH = l.logic
    ? measureBody(doc, l.logic, { size: 10, family: FONT_SANS, maxWidth: innerW - 14, leading: 5.2 })
    : 0;
  const cardH = innerPad + 8 + logicH + innerPad - 2;
  const y = checkY(doc, yIn, cardH + 3);
  card(doc, MARGIN_X, y, CONTENT_W, cardH, { fill: SURFACE_1, stripe: colors.fg });
  // Numeral
  setText(doc, colors.fg, 16, 'bold', FONT_SERIF);
  doc.text(String(idx + 1).padStart(2, '0'), MARGIN_X + innerPad + 1, y + innerPad + 7);
  // Scenario name
  setText(doc, colors.fg, 12.5, 'bold', FONT_SERIF);
  doc.text(l.name, MARGIN_X + innerPad + 14, y + innerPad + 6);
  if (l.logic) {
    body(doc, y + innerPad + 12, l.logic, {
      indent: MARGIN_X + innerPad + 14,
      maxWidth: innerW - 14,
      color: INK_SOFT,
      size: 10,
      leading: 5.2,
      trailingGap: 0,
    });
  }
  return y + cardH + 3;
}

/**
 * Single-column driving-force row — rank numeral + title + score bar
 * on the first line, description flowing below at body size. Replaces
 * the 2-col grid that caused row-height orphan headers when forces
 * had long descriptions.
 */
function renderDrivingForceRow(doc: jsPDF, yIn: number, f: DrivingForce): number {
  let y = checkY(doc, yIn, 18);
  const score = Math.max(0, Math.min(100, Math.round(f.impactScore ?? 0)));
  const titleX = MARGIN_X + 12;
  // Score lock-up reserves a fixed width on the right edge (number +
  // bar). Title can use everything to its left and wraps on overflow.
  setText(doc, GOLD, 10, 'bold', FONT_MONO);
  const scoreStr = `${score}%`;
  const scoreW = doc.getTextWidth(scoreStr);
  const barW = 50;
  const rightBlockW = scoreW + barW + 4;
  const titleMaxW = CONTENT_W - 12 - rightBlockW - 4;
  // Big rank numeral
  setText(doc, GOLD, 18, 'bold', FONT_SERIF);
  doc.text(`${f.rank}`, MARGIN_X, y + 4);
  // Title — wraps to multiple lines if needed (no clipping)
  setText(doc, INK, 11, 'bold', FONT_SERIF);
  const titleLines = doc.splitTextToSize(f.title, titleMaxW) as string[];
  let ty = y + 3;
  for (let i = 0; i < titleLines.length; i++) {
    doc.text(titleLines[i], titleX, ty);
    ty += 5.5;
  }
  // Score + bar — drawn on the right of the FIRST title line
  bar(doc, PAGE_W - MARGIN_X - scoreW - barW - 4, y + 1.5, barW, score, GOLD);
  setText(doc, GOLD, 10, 'bold', FONT_MONO);
  doc.text(scoreStr, PAGE_W - MARGIN_X - scoreW, y + 3);
  // Move y past the (possibly multi-line) title
  y = Math.max(ty, y + 6);
  // Description
  if (f.description) {
    y = body(doc, y, f.description, {
      indent: titleX,
      maxWidth: CONTENT_W - 12,
      color: INK_SOFT,
      size: 9.5,
      leading: 4.8,
      trailingGap: 3,
    });
  }
  return y + 1;
}

/** Measure an axis card's height for the row-paginate check. */
function measureAxisCard(doc: jsPDF, a: UncertaintyAxis, w: number): number {
  const innerPad = 6;
  const innerW = w - innerPad * 2;
  setText(doc, INK, 11, 'bold', FONT_SERIF);
  const labelLines = doc.splitTextToSize(a.label, innerW) as string[];
  const labelH = labelLines.length * 5.6;
  const poleLowH = a.poleLow
    ? measureBody(doc, a.poleLow, { size: 9, family: FONT_SANS, maxWidth: innerW - 7, leading: 4.6 })
    : 0;
  const poleHighH = a.poleHigh
    ? measureBody(doc, a.poleHigh, { size: 9, family: FONT_SANS, maxWidth: innerW - 7, leading: 4.6 })
    : 0;
  const rationaleH = a.rationale
    ? 5 + measureBody(doc, a.rationale, { size: 8.5, family: FONT_SANS, maxWidth: innerW, leading: 4.4 })
    : 0;
  return innerPad + labelH + 3 + poleLowH + 3 + poleHighH + 5 + rationaleH + innerPad - 2;
}

function renderAxisCard(
  doc: jsPDF,
  x: number,
  yIn: number,
  w: number,
  a: UncertaintyAxis,
): number {
  const innerPad = 6;
  const innerW = w - innerPad * 2;
  const cardH = measureAxisCard(doc, a, w);
  const y = yIn;
  card(doc, x, y, w, cardH, { fill: SURFACE_1 });
  setText(doc, INK, 11, 'bold', FONT_SERIF);
  const labelLines = doc.splitTextToSize(a.label, innerW) as string[];
  let ty = y + innerPad + 4;
  for (const ln of labelLines) {
    doc.text(ln, x + innerPad, ty);
    ty += 5.6;
  }
  ty += 1;
  if (a.poleLow) {
    pill(doc, x + innerPad, ty + 0.5, '−', RED, RED_BG);
    ty = body(doc, ty, a.poleLow, {
      indent: x + innerPad + 7,
      maxWidth: innerW - 7,
      size: 9,
      color: INK_SOFT,
      leading: 4.6,
      trailingGap: 1,
    });
  }
  if (a.poleHigh) {
    pill(doc, x + innerPad, ty + 0.5, '+', GREEN, GREEN_BG);
    ty = body(doc, ty, a.poleHigh, {
      indent: x + innerPad + 7,
      maxWidth: innerW - 7,
      size: 9,
      color: INK_SOFT,
      leading: 4.6,
      trailingGap: 1,
    });
  }
  if (a.rationale) {
    setText(doc, GOLD, 6.8, 'bold', FONT_MONO);
    doc.text(tx('report.results.sp.rationale', 'Rationale').toUpperCase(), x + innerPad, ty + 3);
    body(doc, ty + 6.5, a.rationale, {
      indent: x + innerPad,
      maxWidth: innerW,
      size: 8.5,
      color: INK_MUTE,
      leading: 4.4,
      trailingGap: 0,
    });
  }
  return y + cardH + 3;
}

/* ── Section: Backcasting ─────────────────────────────────────────── */

function renderBackcasting(doc: jsPDF, entries: BackcastingEntry[]): number {
  let y = addPage(doc);
  drawRunningHead(doc);
  y = pageHeader(
    doc,
    y,
    tx('report.results.tabs.bc', 'Backcasting'),
    isEnLang() ? 'Trajectories' : 'Trayectorias',
    ORANGE,
  );
  for (let i = 0; i < entries.length; i++) {
    if (i > 0) {
      // Each scenario gets a fresh page so type pill + scenario name
      // never bury at the bottom of the previous entry's milestones.
      y = addPage(doc);
      drawRunningHead(doc);
    }
    y = renderBackcastingEntry(doc, y, entries[i], i);
  }
  return y;
}

function renderBackcastingEntry(
  doc: jsPDF,
  yIn: number,
  e: BackcastingEntry,
  idx: number,
): number {
  const colors = scenarioColors(e.scenarioType, idx);
  let y = yIn;
  // Type pill — the pill rect extends ~3.4mm above its anchor y.
  // The 18pt serif title has ~6.5mm cap height, so we need >10mm
  // total clearance between the pill anchor and the title baseline
  // to keep the pill and title visually separated.
  pill(doc, MARGIN_X, y + 5, e.scenarioType ?? '', colors.fg, colors.bg);
  y += 16;
  // Scenario name — more compact
  setText(doc, INK, 18, 'bold', FONT_SERIF);
  const nameLines = doc.splitTextToSize(e.scenarioName ?? '', CONTENT_W) as string[];
  for (const ln of nameLines) {
    y = checkY(doc, y, 7.5);
    doc.text(ln, MARGIN_X, y);
    y += 7.5;
  }
  y += 1;
  doc.setDrawColor(colors.fg);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, y, MARGIN_X + 22, y);
  y += 6;

  if (e.visionStatement) {
    y = subLabel(doc, y, (tx('report.results.bc.vision', 'Vision —').replace(/[—–-]\s*$/, '').trim()), colors.fg);
    y = body(doc, y, e.visionStatement, {
      color: INK,
      size: 11,
      family: FONT_SERIF,
      weight: 'italic',
      leading: 5.8,
      trailingGap: 5,
    });
  }

  if (e.milestones?.length) {
    for (const m of e.milestones) y = renderMilestone(doc, y, m, colors.fg);
  }

  if (e.startingPoint) {
    y = subLabel(doc, y, tx('report.results.bc.start', 'Starting point'), colors.fg);
    y = body(doc, y, e.startingPoint, {
      color: INK_SOFT,
      size: 10,
      leading: 5.2,
      trailingGap: 3,
    });
  }
  return y;
}

function renderMilestone(
  doc: jsPDF,
  yIn: number,
  m: BackcastingMilestone,
  accent: string,
): number {
  const maxWidth = CONTENT_W;
  const titleLines = doc.splitTextToSize(m.title ?? '', maxWidth) as string[];
  const titleH = titleLines.length * 5.6;
  const descH = m.description
    ? measureBody(doc, m.description, { size: 9.5, family: FONT_SANS, maxWidth, leading: 4.9 })
    : 0;
  const blockH = 10 + titleH + descH + 12;
  let y = checkY(doc, yIn, blockH);

  // Year — small mono uppercase label above the title, in the accent
  // colour. No circle, no rail; just a typographic marker.
  if (m.year) {
    setText(doc, accent, 8, 'bold', FONT_MONO);
    doc.text(m.year.toUpperCase(), MARGIN_X, y + 2);
    y += 5;
  }

  // Title
  setText(doc, INK, 12, 'bold', FONT_SERIF);
  let ty = y + 4;
  for (const ln of titleLines) {
    doc.text(ln, MARGIN_X, ty);
    ty += 5.6;
  }
  if (m.description) {
    ty = body(doc, ty + 0.5, m.description, {
      indent: MARGIN_X,
      maxWidth,
      color: INK_SOFT,
      size: 9.5,
      leading: 4.9,
      trailingGap: 0.5,
    });
  }
  if (m.actions?.length) {
    ty = dotBullets(doc, ty + 0.5, m.actions, accent, {
      indent: MARGIN_X,
      maxWidth,
      size: 9,
      textColor: INK_SOFT,
    });
  }
  return ty + 4;
}

/* ── Section: Strategic Map ───────────────────────────────────────── */

/**
 * Strategic map — stacked H1 / H2 / H3 sections, full-width per
 * priority. The 3-column "horizon strip" looks great on screen but
 * breaks in print when any column's cards exceed page height (the
 * dotBullets-per-line pagination shifts subsequent columns to a
 * fresh page at their start-y, collapsing the grid). A stacked
 * layout paginates naturally and packs density without orphan pages.
 */
function renderStrategicMap(doc: jsPDF, items: StrategicPriority[]): number {
  let y = addPage(doc);
  drawRunningHead(doc);
  y = pageHeader(
    doc,
    y,
    tx('report.results.tabs.str', 'Strategic map'),
    isEnLang() ? 'Priorities' : 'Prioridades',
    PURPLE,
  );

  const order: Array<'H1' | 'H2' | 'H3'> = ['H1', 'H2', 'H3'];
  const horizonColors: Record<'H1' | 'H2' | 'H3', string> = {
    H1: GREEN,
    H2: BLUE,
    H3: PURPLE,
  };
  for (const h of order) {
    const group = items.filter((it) => it.horizon === h);
    if (group.length === 0) continue;
    y = renderHorizonHeader(doc, y, h, horizonColors[h]);
    for (const it of group) y = renderPriorityCardWide(doc, y, it, horizonColors[h]);
    y += 4;
  }
  return y;
}

/**
 * Compact horizon section header — big colored badge + horizon
 * timeframe label, with a thin colored rule below. Keeps the
 * horizon's identity attached to its first priority card by reserving
 * enough space for the header + a minimum-height card.
 */
function renderHorizonHeader(doc: jsPDF, yIn: number, h: 'H1' | 'H2' | 'H3', color: string): number {
  let y = checkY(doc, yIn, 36);
  setText(doc, color, 24, 'bold', FONT_SERIF);
  doc.text(h, MARGIN_X, y + 4);
  setText(doc, INK, 11, 'bold', FONT_SANS);
  doc.text(tx(`report.results.str.${h.toLowerCase()}`, h), MARGIN_X + 16, y + 1);
  doc.setDrawColor(color);
  doc.setLineWidth(0.45);
  doc.line(MARGIN_X, y + 6, PAGE_W - MARGIN_X, y + 6);
  return y + 11;
}

/**
 * Wide priority card — full content-width row with the title, impact
 * pill, optional timeframe and action bullets. Uses dotBullets which
 * paginates naturally on line overflow.
 */
function renderPriorityCardWide(
  doc: jsPDF,
  yIn: number,
  it: StrategicPriority,
  horizonColor: string,
): number {
  const colors = impactColors(it.impact);
  const innerPad = 6;
  const innerW = CONTENT_W - innerPad * 2;
  setText(doc, INK, 12, 'bold', FONT_SERIF);
  const titleLines = doc.splitTextToSize(it.title, innerW - 30) as string[];
  const titleH = titleLines.length * 6;
  let actionsH = 0;
  if (it.actions?.length) {
    const size = 9;
    const leading = size * 0.55;
    for (const a of it.actions) {
      const lines = doc.splitTextToSize(a, innerW - 6) as string[];
      actionsH += lines.length * leading + 0.4;
    }
    actionsH += 2;
  }
  const tframeH = it.timeframe ? 5 : 0;
  const cardH = innerPad + titleH + tframeH + actionsH + innerPad - 2;
  const y = checkY(doc, yIn, cardH + 3);
  card(doc, MARGIN_X, y, CONTENT_W, cardH, { fill: SURFACE_1, stripe: horizonColor });
  // Impact pill top-right
  const label = impactLabel(it.impact).toUpperCase();
  setText(doc, colors.fg, 6.8, 'bold', FONT_MONO);
  const labelW = doc.getTextWidth(label) + 5;
  doc.setFillColor(colors.bg);
  doc.roundedRect(PAGE_W - MARGIN_X - innerPad - labelW, y + innerPad - 2, labelW, 4.2, 1.2, 1.2, 'F');
  setText(doc, colors.fg, 6.8, 'bold', FONT_MONO);
  doc.text(label, PAGE_W - MARGIN_X - innerPad - labelW + 2.5, y + innerPad + 1);
  // Title
  setText(doc, INK, 12, 'bold', FONT_SERIF);
  let ty = y + innerPad + 4;
  for (const ln of titleLines) {
    doc.text(ln, MARGIN_X + innerPad + 1, ty);
    ty += 6;
  }
  if (it.timeframe) {
    setText(doc, INK_MUTE, 8.5, 'italic', FONT_SERIF);
    doc.text(it.timeframe, MARGIN_X + innerPad + 1, ty);
    ty += 5;
  }
  if (it.actions?.length) {
    ty = dotBullets(doc, ty + 1, it.actions, horizonColor, {
      indent: MARGIN_X + innerPad + 1,
      maxWidth: innerW - 2,
      size: 9,
      textColor: INK_SOFT,
    });
  }
  return y + cardH + 3;
}

/* ── Section: Signals & Wildcards ─────────────────────────────────── */

function renderSignals(doc: jsPDF, signals: WeakSignal[], wildcards: Wildcard[]): number {
  let y = addPage(doc);
  drawRunningHead(doc);
  y = pageHeader(
    doc,
    y,
    tx('report.results.tabs.signals', 'Signals & wildcards'),
    isEnLang() ? 'Edge cases' : 'Casos límite',
    PURPLE,
  );
  if (signals.length) {
    y = sectionLabel(doc, y, tx('report.results.sig.signals', 'Weak signals detected'));
    y = renderSignalsGrid(doc, y, signals);
    y += 6;
  }
  if (wildcards.length) {
    y = sectionLabel(doc, y + 2, tx('report.results.sig.wildcards', 'Wildcards'), PURPLE);
    for (const w of wildcards) y = renderWildcardCard(doc, y, w);
  }
  return y;
}

/**
 * Signals 2-column grid. Pairs signals up and aligns row heights for
 * a tidy editorial grid.
 */
function renderSignalsGrid(doc: jsPDF, yIn: number, signals: WeakSignal[]): number {
  let y = yIn;
  const gap = 6;
  const colW = (CONTENT_W - gap) / 2;
  for (let i = 0; i < signals.length; i += 2) {
    const pair = signals.slice(i, i + 2);
    const heights = pair.map((s) => measureWeakSignalCard(doc, s, colW));
    const rowH = Math.max(...heights);
    y = checkY(doc, y, rowH + 4);
    pair.forEach((s, idx) => {
      const x = MARGIN_X + idx * (colW + gap);
      drawWeakSignalCard(doc, x, y, colW, rowH, s);
    });
    y += rowH + gap;
  }
  return y;
}

function measureWeakSignalCard(doc: jsPDF, s: WeakSignal, w: number): number {
  const innerPad = 5;
  const innerW = w - innerPad * 2;
  const titleLines = doc.splitTextToSize(s.title, innerW - 12) as string[];
  const titleH = titleLines.length * 5;
  const dimH = s.dimension ? 4 : 0;
  const descH = s.description
    ? measureBody(doc, s.description, { size: 8.5, family: FONT_SANS, maxWidth: innerW - 12, leading: 4.4 })
    : 0;
  return innerPad + Math.max(titleH, 8) + dimH + descH + innerPad - 1;
}

function drawWeakSignalCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  s: WeakSignal,
) {
  const colors = dimensionColors(s.dimension);
  const innerPad = 5;
  const innerW = w - innerPad * 2;
  card(doc, x, y, w, h, { fill: SURFACE_1 });
  // Letter badge — compact
  const initial = (s.dimension ?? '').trim().charAt(0).toUpperCase() || '•';
  doc.setFillColor(colors.bg);
  doc.roundedRect(x + innerPad, y + innerPad - 1, 8, 8, 1.4, 1.4, 'F');
  setText(doc, colors.fg, 8.5, 'bold', FONT_MONO);
  const iw = doc.getTextWidth(initial);
  doc.text(initial, x + innerPad + 4 - iw / 2, y + innerPad + 4.5);
  // Title
  setText(doc, INK, 10, 'bold', FONT_SANS);
  const titleX = x + innerPad + 11;
  const titleMaxW = innerW - 11;
  const titleLines = doc.splitTextToSize(s.title, titleMaxW) as string[];
  let ty = y + innerPad + 4.5;
  for (const ln of titleLines) {
    doc.text(ln, titleX, ty);
    ty += 5;
  }
  if (s.dimension) {
    setText(doc, colors.fg, 7, 'bold', FONT_MONO);
    doc.text(s.dimension.toUpperCase(), titleX, ty);
    ty += 4;
  }
  if (s.description) {
    body(doc, ty + 0.5, s.description, {
      indent: titleX,
      maxWidth: titleMaxW,
      color: INK_SOFT,
      size: 8.5,
      leading: 4.4,
      trailingGap: 0,
    });
  }
}

function renderWildcardCard(doc: jsPDF, yIn: number, w: Wildcard): number {
  const innerPad = 6;
  const innerW = CONTENT_W - innerPad * 2;
  const titleLines = doc.splitTextToSize(w.title, innerW - 4) as string[];
  const titleH = titleLines.length * 6.5;
  const descH = w.description
    ? measureBody(doc, w.description, { size: 10.5, family: FONT_SANS, maxWidth: innerW - 4, leading: 5.4 })
    : 0;
  const cardH = innerPad + titleH + descH + innerPad - 2;
  const y = checkY(doc, yIn, cardH + 4);
  card(doc, MARGIN_X, y, CONTENT_W, cardH, { fill: SURFACE_2, stripe: PURPLE });
  setText(doc, PURPLE, 13.5, 'bold', FONT_SERIF);
  let ty = y + innerPad + 6;
  for (const ln of titleLines) {
    doc.text(ln, MARGIN_X + innerPad + 2, ty);
    ty += 6.5;
  }
  if (w.description) {
    body(doc, ty + 1, w.description, {
      indent: MARGIN_X + innerPad + 2,
      maxWidth: innerW - 2,
      color: INK_SOFT,
      size: 10.5,
      leading: 5.4,
      trailingGap: 0,
    });
  }
  return y + cardH + 4;
}

/* ── Section: Sources ─────────────────────────────────────────────── */

function renderSources(doc: jsPDF, src: Sources): number {
  let y = addPage(doc);
  drawRunningHead(doc);
  y = pageHeader(
    doc,
    y,
    tx('report.results.tabs.sources', 'Sources'),
    isEnLang() ? 'References' : 'Referencias',
    INK_MUTE,
  );
  const intro = tx('report.results.sources.intro', '');
  if (intro) {
    y = body(doc, y, intro, { color: INK_SOFT, size: 10.5, family: FONT_SERIF, weight: 'italic', leading: 5.6, trailingGap: 6 });
  }
  if (src.globalSteep?.length) {
    y = sectionLabel(doc, y, tx('report.results.sources.global', 'Global context'));
    y = renderSourceList(doc, y, src.globalSteep);
  }
  const sectionMap: Array<{ key: 'A' | 'B' | 'C' | 'D' | 'E'; labelKey: string }> = [
    { key: 'A', labelKey: 'report.results.sources.sectionA' },
    { key: 'B', labelKey: 'report.results.sources.sectionB' },
    { key: 'C', labelKey: 'report.results.sources.sectionC' },
    { key: 'D', labelKey: 'report.results.sources.sectionD' },
    { key: 'E', labelKey: 'report.results.sources.sectionE' },
  ];
  if (src.bySection) {
    for (const { key, labelKey } of sectionMap) {
      const list = src.bySection[key];
      if (list && list.length > 0) {
        y = sectionLabel(doc, y, tx(labelKey, key));
        y = renderSourceList(doc, y, list);
      }
    }
  } else if (src.report?.length) {
    y = sectionLabel(doc, y, tx('report.results.sources.report', 'Report'));
    y = renderSourceList(doc, y, src.report);
  } else if (src.sources?.length) {
    y = renderSourceList(doc, y, src.sources);
  }
  return y;
}

function renderSourceList(doc: jsPDF, y: number, list: SourceItem[]): number {
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    y = checkY(doc, y, 10);
    // Index numeral
    setText(doc, GOLD, 8, 'bold', FONT_MONO);
    const idx = String(i + 1).padStart(2, '0');
    doc.text(idx, MARGIN_X, y);
    // Title — compact
    setText(doc, INK, 9.5, 'bold', FONT_SANS);
    const titleLines = doc.splitTextToSize(it.title || it.url || '—', CONTENT_W - 12) as string[];
    let ty = y;
    for (const ln of titleLines) {
      ty = checkY(doc, ty, 4.5);
      doc.text(ln, MARGIN_X + 11, ty);
      ty += 4.5;
    }
    if (it.url) {
      setText(doc, INK_MUTE, 8, 'italic', FONT_MONO);
      const urlLines = doc.splitTextToSize(it.url, CONTENT_W - 12) as string[];
      // Show only the first URL line — long URLs truncate to keep
      // the source list dense.
      const ln = urlLines[0] ?? '';
      ty = checkY(doc, ty, 4);
      doc.text(ln + (urlLines.length > 1 ? '…' : ''), MARGIN_X + 11, ty);
      ty += 4;
    }
    if (it.description) {
      ty = body(doc, ty + 0.5, it.description, {
        indent: MARGIN_X + 11,
        maxWidth: CONTENT_W - 12,
        color: INK_SOFT,
        size: 8.5,
        family: FONT_SANS,
        leading: 4.4,
        trailingGap: 0,
      });
    }
    y = ty + 2.5;
  }
  return y + 2;
}

/* ── Footer (page numbers + wordmark + running head) ──────────────── */

function addFootersAndHeads(doc: jsPDF, reportTitle: string, tocPageNum: number) {
  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    // Skip drawing a duplicate running head over the TOC (already drawn).
    // Section openers also already drew the head; redraw is idempotent.
    if (p !== tocPageNum) drawRunningHead(doc, reportTitle);
    // Footer rule + page number + wordmark
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, PAGE_H - 14, PAGE_W - MARGIN_X, PAGE_H - 14);
    setText(doc, GOLD, 7, 'bold', FONT_MONO);
    doc.text('FUTUROS', MARGIN_X, PAGE_H - 8);
    setText(doc, INK_MUTE, 7.5, 'normal', FONT_MONO);
    const pageStr = `${p} / ${total}`;
    const w = doc.getTextWidth(pageStr);
    doc.text(pageStr, PAGE_W - MARGIN_X - w, PAGE_H - 8);
  }
}

/* ── Entry point ──────────────────────────────────────────────────── */

/**
 * Render a foresight report into a downloadable PDF.
 *
 * @param report   the report payload (inputData + resultData + meta)
 * @param language optional explicit language override. When supplied,
 *                 i18n is temporarily switched to that language for the
 *                 duration of the render so the cover, section labels
 *                 and other chrome strings come out in the same language
 *                 as the report content. Defaults to whatever i18n is
 *                 currently set to (i.e. the user's UI language).
 */
export async function exportReportPdf(
  report: ReportResponse,
  language?: 'es' | 'en',
) {
  const originalLang = i18n.language;
  const needSwitch =
    !!language && language.slice(0, 2) !== originalLang.slice(0, 2);
  if (needSwitch) await i18n.changeLanguage(language);
  try {
    await renderReport(report);
  } finally {
    if (needSwitch) await i18n.changeLanguage(originalLang);
  }
}

async function renderReport(report: ReportResponse) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await ensureFonts(doc);

  // Reset TOC cache for this export.
  tocEntries.length = 0;

  const input = (report.inputData ?? {}) as InputData;
  const result = (report.resultData ?? null) as ResultData | null;
  const cp = input.companyProfile ?? {};
  const en = isEnLang();

  // 1. Cover
  renderCover(doc, report, result, cp);

  // 2. Reserve TOC slot — filled at the end with the section page map.
  const tocPageNum = reserveTocPage(doc);

  // 3. Reading order:
  //    - Brief + Executive Summary (combined opening spread)
  //    - STEEP context (2-col grid)
  //    - Key uncertainties (2-col grid)
  //    - 3P Scenarios (full section: opener page + one feature per scenario)
  //    - Scenario Planning
  //    - Backcasting
  //    - Strategic map
  //    - Signals & wildcards
  //    - Sources
  if (result?.executiveSummary || input.companyProfile) {
    renderBriefAndExec(doc, input, result?.executiveSummary);
  }

  // STEEP — only renders if there's actual content (after key
  // normalisation, which handles both StepGlobal short codes and
  // StepSteep full-name keys).
  const gN = normalizeSteepKeys(input.globalSteep);
  const sN = normalizeSteepKeys(input.steep);
  if (Object.keys(gN).length > 0 || Object.keys(sN).length > 0) {
    const yStart = addPage(doc);
    drawRunningHead(doc);
    renderSteepInputs(doc, yStart, input);
  }

  if (result) {
    if (result.keyUncertainties?.length) {
      const yStart = addPage(doc);
      drawRunningHead(doc);
      renderUncertainties(doc, yStart, result.keyUncertainties);
    }
    if (result.scenarios?.length) renderScenarios(doc, result.scenarios);
    if (
      result.scenarioPlanning &&
      ((result.scenarioPlanning.drivingForces?.length ?? 0) > 0 ||
        (result.scenarioPlanning.axes?.length ?? 0) > 0 ||
        (result.scenarioPlanning.scenarioLogics?.length ?? 0) > 0)
    ) {
      renderScenarioPlanning(doc, result.scenarioPlanning);
    }
    if (result.backcasting?.length) renderBackcasting(doc, result.backcasting);
    if (result.strategicMap?.length) renderStrategicMap(doc, result.strategicMap);
    if ((result.weakSignals?.length ?? 0) > 0 || (result.wildcards?.length ?? 0) > 0) {
      renderSignals(doc, result.weakSignals ?? [], result.wildcards ?? []);
    }
    if (
      result.sources &&
      ((result.sources.sources?.length ?? 0) > 0 ||
        (result.sources.report?.length ?? 0) > 0 ||
        (result.sources.globalSteep?.length ?? 0) > 0 ||
        (result.sources.bySection &&
          Object.values(result.sources.bySection).some((v) => (v?.length ?? 0) > 0)))
    ) {
      renderSources(doc, result.sources);
    }
  }

  // 4. Build per-section teaser strings derived from the data.
  const teasers = buildTocTeasers(result, input, en);

  // 5. Render TOC with correct page numbers + teasers.
  renderToc(doc, tocPageNum, 0, report.title, teasers);

  // 6. Footers + running heads on every non-cover page.
  addFootersAndHeads(doc, report.title, tocPageNum);

  const safeName = report.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'report';
  doc.save(`${safeName}_foresight.pdf`);
}
