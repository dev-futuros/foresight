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
    if (fontState === 'ready') registerCachedFonts(doc);
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
  const paragraphs = text.split(/\n{2,}/);
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

/** Measure a body block in mm without drawing it. */
function measureBody(
  doc: jsPDF,
  text: string,
  opts: { size?: number; family?: string; weight?: FontWeight; maxWidth: number; leading?: number },
): number {
  const size = opts.size ?? 10.5;
  const leading = opts.leading ?? size * 0.55;
  setText(doc, INK, size, opts.weight ?? 'normal', opts.family ?? FONT_SANS);
  const paragraphs = text.split(/\n{2,}/);
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
 * pages — see {@link sectionOpener}.
 */
function sectionLabel(doc: jsPDF, y: number, text: string, color = GOLD): number {
  y = checkY(doc, y, 14);
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

function rule(doc: jsPDF, y: number, color = LINE_STRONG, width = 0.25): number {
  y = checkY(doc, y, 4);
  doc.setDrawColor(color);
  doc.setLineWidth(width);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  return y + 4;
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

/**
 * Flow body text into N columns starting at (xStart, yStart). Returns
 * the y of the bottom of the longest column. Does NOT paginate — the
 * caller must ensure the text fits the available block height.
 */
function bodyColumns(
  doc: jsPDF,
  xStart: number,
  yStart: number,
  totalWidth: number,
  text: string,
  cols: number,
  opts: {
    gap?: number;
    size?: number;
    leading?: number;
    color?: string;
    family?: string;
    weight?: FontWeight;
  } = {},
): number {
  const gap = opts.gap ?? 6;
  const size = opts.size ?? 10.5;
  const leading = opts.leading ?? size * 0.55;
  const colW = (totalWidth - gap * (cols - 1)) / cols;
  setText(doc, opts.color ?? INK_SOFT, size, opts.weight ?? 'normal', opts.family ?? FONT_SANS);
  // Split into all lines first, then distribute across columns by
  // count. Simple but works for short blocks; paragraphs collapse.
  const paragraphs = text.split(/\n{2,}/);
  const lines: string[] = [];
  for (let p = 0; p < paragraphs.length; p++) {
    const para = paragraphs[p].trim();
    const wrapped = doc.splitTextToSize(para, colW) as string[];
    lines.push(...wrapped);
    if (p < paragraphs.length - 1) lines.push(''); // paragraph break
  }
  const linesPerCol = Math.ceil(lines.length / cols);
  let maxY = yStart;
  for (let c = 0; c < cols; c++) {
    const cx = xStart + c * (colW + gap);
    let cy = yStart;
    const start = c * linesPerCol;
    const end = Math.min(start + linesPerCol, lines.length);
    for (let i = start; i < end; i++) {
      if (lines[i] === '') {
        cy += leading * 0.5;
        continue;
      }
      doc.text(lines[i], cx, cy);
      cy += leading;
    }
    maxY = Math.max(maxY, cy);
  }
  return maxY;
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
 * Full-page section opener: huge gold serif numeral on the left
 * baseline + section title in display serif. Acts as a "chapter
 * break" between major sections, matching magazine convention. The
 * opener also records the TOC entry.
 */
function sectionOpener(
  doc: jsPDF,
  title: string,
  kicker: string,
  color = GOLD,
): number {
  let y = addPage(doc);
  const num = recordSection(doc, title, color);

  // Top-of-page wordmark + gold rule (running head).
  drawRunningHead(doc);

  // Vertical hairline aligned with the numeral.
  doc.setDrawColor(color);
  doc.setLineWidth(0.45);
  const numAreaX = MARGIN_X;
  const numY = MARGIN_TOP + 80;
  doc.line(numAreaX, numY - 50, numAreaX, numY - 6);

  // Oversized numeral
  setText(doc, color, 86, 'bold', FONT_SERIF);
  doc.text(num, numAreaX + 4, numY);

  // Kicker (mono uppercase)
  setText(doc, INK_MUTE, 8.5, 'bold', FONT_MONO);
  doc.text(kicker.toUpperCase(), numAreaX + 4, numY + 12);

  // Title (display serif)
  setText(doc, INK, 30, 'bold', FONT_SERIF);
  const titleLines = doc.splitTextToSize(title, CONTENT_W - 4) as string[];
  let ty = numY + 30;
  for (const ln of titleLines) {
    doc.text(ln, numAreaX + 4, ty);
    ty += 12;
  }
  return ty + 14;
}

/**
 * Running head drawn at the top of every non-cover, non-TOC page —
 * gold "FUTUROS" wordmark left, report title right, with a thin
 * rule below. Called from {@link addFooters} + sectionOpener.
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

  // Standfirst / deck — derived from the executive summary's first
  // sentence if available; falls back to the strategic challenge.
  const deck = pickCoverDeck(result, cp, en);
  if (deck) {
    y = standfirst(doc, MARGIN_X, y, CONTENT_W * 0.86, deck, {
      size: 15,
      color: INK_SOFT,
      leading: 9,
    });
    y += 4;
  }

  // ── Quick-stats strip ──────────────────────────────────────────
  // Three magazine-style stat lock-ups in a row — surfaces the
  // report's scale at a glance.
  const stats = collectCoverStats(report, result, cp, en);
  if (stats.length > 0) {
    const statsY = 222;
    doc.setDrawColor(LINE_STRONG);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, statsY - 12, PAGE_W - MARGIN_X, statsY - 12);
    const colW = CONTENT_W / stats.length;
    for (let i = 0; i < stats.length; i++) {
      const x = MARGIN_X + i * colW;
      setText(doc, INK, 26, 'bold', FONT_SERIF);
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

  // Editorial top block: kicker + huge "Contents" headline
  let y = MARGIN_TOP + 14;
  kicker(doc, MARGIN_X, y, en ? 'Inside this report' : 'Dentro de este informe', GOLD, 8.5);
  y += 10;
  setText(doc, INK, 38, 'bold', FONT_SERIF);
  doc.text(en ? 'Contents' : 'Contenidos', MARGIN_X, y + 14);
  y += 22;
  // Long gold rule
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  y += 16;

  // Entries
  const entryGap = 14;
  const pageColW = 22;
  const textColW = CONTENT_W - pageColW - 6;
  for (const e of tocEntries) {
    y = checkY(doc, y, 28);
    const shifted = e.page + shift;
    // Big colored numeral
    setText(doc, e.color, 22, 'bold', FONT_SERIF);
    doc.text(e.num, MARGIN_X, y + 1);
    // Title in display serif
    const titleX = MARGIN_X + 16;
    setText(doc, INK, 16, 'bold', FONT_SERIF);
    const titleMaxW = textColW - 16;
    const titleLines = doc.splitTextToSize(e.title, titleMaxW) as string[];
    let ty = y;
    for (const ln of titleLines) {
      doc.text(ln, titleX, ty);
      ty += 7.2;
    }
    // Teaser
    const teaser = teasers[e.num];
    if (teaser) {
      setText(doc, INK_SOFT, 10, 'italic', FONT_SERIF);
      const teaserLines = doc.splitTextToSize(teaser, titleMaxW) as string[];
      for (const ln of teaserLines.slice(0, 2)) {
        doc.text(ln, titleX, ty);
        ty += 5;
      }
    }
    // Page number on the right
    setText(doc, INK, 22, 'normal', FONT_SERIF);
    const pageStr = String(shifted);
    const pageW = doc.getTextWidth(pageStr);
    doc.text(pageStr, PAGE_W - MARGIN_X - pageW, y + 1);
    setText(doc, INK_MUTE, 6.5, 'bold', FONT_MONO);
    doc.text((en ? 'Page' : 'Pág.').toUpperCase(), PAGE_W - MARGIN_X - pageW, y - 4);
    // Move y past the longer of the two columns
    y = Math.max(ty, y + 8) + entryGap;
    // Thin rule between entries
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, y - 8, PAGE_W - MARGIN_X, y - 8);
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
  const g = input.globalSteep ?? {};
  const s = input.steep ?? {};
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
 * Renders STEEP dimensions as a 2-column grid of compact cards. Pairs
 * up two cards per row, advancing y by the taller card's height.
 */
function renderSteepGrid(
  doc: jsPDF,
  yIn: number,
  block: SteepBlock,
  dims: Array<'S' | 'T' | 'E' | 'ENV' | 'P'>,
): number {
  let y = yIn;
  const gap = 6;
  const colW = (CONTENT_W - gap) / 2;
  const filled = dims.filter((k) => (block[k] ?? '').trim().length > 0);
  for (let i = 0; i < filled.length; i += 2) {
    const pair = filled.slice(i, i + 2);
    const heights = pair.map((k) => measureSteepCard(doc, k, (block[k] ?? '').trim(), colW));
    const rowH = Math.max(...heights);
    y = checkY(doc, y, rowH + 4);
    pair.forEach((k, idx) => {
      const x = MARGIN_X + idx * (colW + gap);
      drawSteepCard(doc, x, y, colW, rowH, k, (block[k] ?? '').trim());
    });
    y += rowH + gap;
  }
  return y;
}

function measureSteepCard(doc: jsPDF, _k: string, value: string, w: number): number {
  const innerPad = 5;
  const innerW = w - innerPad * 2 - 12;
  const descH = measureBody(doc, value, { size: 9.5, family: FONT_SANS, maxWidth: innerW, leading: 5 });
  return innerPad + 12 + descH + innerPad - 2;
}

function drawSteepCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  k: 'S' | 'T' | 'E' | 'ENV' | 'P',
  value: string,
) {
  const { fg, bg } = steepColor(k);
  card(doc, x, y, w, h, { fill: SURFACE_1, stripe: fg });
  const innerPad = 5;
  // Letter badge
  doc.setFillColor(bg);
  doc.roundedRect(x + innerPad, y + innerPad - 1, 9, 9, 1.5, 1.5, 'F');
  setText(doc, fg, 9, 'bold', FONT_MONO);
  const lw = doc.getTextWidth(k);
  doc.text(k, x + innerPad + 4.5 - lw / 2, y + innerPad + 5);
  // Title
  setText(doc, INK, 11, 'bold', FONT_SANS);
  doc.text(steepLabel(k), x + innerPad + 13, y + innerPad + 5);
  // Description
  body(doc, y + innerPad + 11, value, {
    indent: x + innerPad,
    maxWidth: w - innerPad * 2,
    size: 9.5,
    color: INK_SOFT,
    leading: 5,
    trailingGap: 0,
  });
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
  const gap = 8;
  const colW = (CONTENT_W - gap) / 2;
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    const heights = pair.map((u) => measureUncertaintyCard(doc, u, colW));
    const rowH = Math.max(...heights);
    y = checkY(doc, y, rowH + 6);
    pair.forEach((u, idx) => {
      const x = MARGIN_X + idx * (colW + gap);
      drawUncertaintyCard(doc, x, y, colW, rowH, u, i + idx);
    });
    y += rowH + 10;
    // Optional thin rule between rows for editorial cadence
    if (i + 2 < items.length) {
      doc.setDrawColor(LINE);
      doc.setLineWidth(0.2);
      doc.line(MARGIN_X, y - 5, PAGE_W - MARGIN_X, y - 5);
    }
  }
  return y + 2;
}

function measureUncertaintyCard(doc: jsPDF, u: KeyUncertainty, w: number): number {
  const titleW = w - 14;
  setText(doc, INK, 13, 'bold', FONT_SERIF);
  const titleLines = doc.splitTextToSize(u.name, titleW) as string[];
  const titleH = titleLines.length * 6.5;
  const descH = u.description
    ? measureBody(doc, u.description, { size: 10, family: FONT_SANS, maxWidth: titleW, leading: 5.3 })
    : 0;
  return Math.max(titleH + descH + 6, 22);
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
  // Big gold numeral
  setText(doc, GOLD, 28, 'bold', FONT_SERIF);
  doc.text(numStr, x, y + 8);
  // Tiny "QUESTION" kicker under the numeral
  const en = isEnLang();
  setText(doc, INK_MUTE, 6.5, 'bold', FONT_MONO);
  doc.text((en ? 'Question' : 'Pregunta').toUpperCase(), x, y + 13);
  // Title
  const titleX = x + 14;
  const titleW = w - 14;
  setText(doc, INK, 13, 'bold', FONT_SERIF);
  const titleLines = doc.splitTextToSize(u.name, titleW) as string[];
  let ty = y + 5;
  for (const ln of titleLines) {
    doc.text(ln, titleX, ty);
    ty += 6.5;
  }
  if (u.description) {
    body(doc, ty + 1, u.description, {
      indent: titleX,
      maxWidth: titleW,
      color: INK_SOFT,
      size: 10,
      leading: 5.3,
      trailingGap: 0,
    });
  }
}

/* ── Section: 3P Scenarios ────────────────────────────────────────── */

function renderScenarios(doc: jsPDF, scenarios: Scenario[]): number {
  let y = sectionOpener(
    doc,
    tx('report.results.tabs.scenarios', '3P Scenarios'),
    isEnLang() ? 'Futures' : 'Futuros',
    GREEN,
  );
  // Section opener page also has room to introduce the trio — list
  // them as a "preview index" so readers know what's coming.
  y = renderScenarioPreview(doc, y, scenarios);
  for (let i = 0; i < scenarios.length; i++) {
    y = addPage(doc);
    drawRunningHead(doc);
    y = renderScenarioFeature(doc, y, scenarios[i], i);
  }
  return y;
}

/**
 * Scenario preview index — appears on the section-opener page after
 * the big numeral. Three slim "card-strip" rows, one per scenario,
 * giving type + name + probability so the opener page already
 * communicates the scope of what follows.
 */
function renderScenarioPreview(doc: jsPDF, yIn: number, scenarios: Scenario[]): number {
  let y = yIn;
  setText(doc, INK_MUTE, 7.5, 'bold', FONT_MONO);
  doc.text(
    (isEnLang() ? 'In this section' : 'En esta sección').toUpperCase(),
    MARGIN_X,
    y,
  );
  y += 8;
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    const colors = scenarioColors(s.type, i);
    y = checkY(doc, y, 18);
    // Stripe + name + type pill + probability
    card(doc, MARGIN_X, y, CONTENT_W, 14, { fill: SURFACE_1, stripe: colors.fg });
    setText(doc, colors.fg, 22, 'bold', FONT_SERIF);
    doc.text(String(i + 1).padStart(2, '0'), MARGIN_X + 6, y + 11);
    setText(doc, INK, 13, 'bold', FONT_SERIF);
    const name = s.name ?? s.title ?? '';
    const nameMaxW = CONTENT_W - 70;
    const nameClipped = clipText(doc, name, nameMaxW);
    doc.text(nameClipped, MARGIN_X + 22, y + 9);
    // Type pill right-aligned, with probability
    if (s.probability) {
      setText(doc, colors.fg, 11, 'bold', FONT_SERIF);
      const pw = doc.getTextWidth(s.probability);
      doc.text(s.probability, PAGE_W - MARGIN_X - 6 - pw, y + 9);
    }
    setText(doc, colors.fg, 7, 'bold', FONT_MONO);
    const typeStr = (s.type ?? '').toUpperCase();
    const tw = doc.getTextWidth(typeStr);
    doc.text(typeStr, PAGE_W - MARGIN_X - 6 - tw - 18, y + 9);
    y += 18;
  }
  return y + 4;
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
  // Scenario number on the right — big serif numeral
  setText(doc, colors.fg, 26, 'bold', FONT_SERIF);
  const numStr = String(idx + 1).padStart(2, '0');
  const nw = doc.getTextWidth(numStr);
  doc.text(numStr, PAGE_W - MARGIN_X - nw, yIn + 10);
  setText(doc, INK_MUTE, 6.5, 'bold', FONT_MONO);
  doc.text(
    (en ? 'Scenario' : 'Escenario').toUpperCase(),
    PAGE_W - MARGIN_X - nw,
    yIn + 14,
  );
  let y = yIn + 22;

  // ── Headline ──────────────────────────────────────────────────
  // Auto-shrink the headline to keep it to <=3 lines.
  let titleSize = 36;
  let titleLines: string[] = [];
  for (;;) {
    setText(doc, INK, titleSize, 'bold', FONT_SERIF);
    titleLines = doc.splitTextToSize(s.name ?? s.title ?? '', CONTENT_W) as string[];
    if (titleLines.length <= 3 || titleSize <= 22) break;
    titleSize -= 3;
  }
  setText(doc, INK, titleSize, 'bold', FONT_SERIF);
  for (const ln of titleLines) {
    y = checkY(doc, y, titleSize * 0.5);
    doc.text(ln, MARGIN_X, y + titleSize * 0.32);
    y += titleSize * 0.48;
  }
  y += 4;
  doc.setDrawColor(colors.fg);
  doc.setLineWidth(0.6);
  doc.line(MARGIN_X, y, MARGIN_X + 28, y);
  y += 10;

  // ── Standfirst (italic deck — first sentence of description) ───
  const descParts = (s.description ?? '').trim();
  const firstSentence = descParts
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/)[0];
  const rest = descParts.slice(firstSentence.length).trim();
  if (firstSentence) {
    y = standfirst(doc, MARGIN_X, y, CONTENT_W, firstSentence, {
      size: 14,
      color: INK,
      leading: 8,
    });
    y += 2;
  }

  // ── Hero probability stat (right-aligned) + body block ─────────
  if (s.probability) {
    // Render the stat anchored to the top-right of the body block.
    const statW = 56;
    const statX = PAGE_W - MARGIN_X - statW;
    setText(doc, INK_MUTE, 7, 'bold', FONT_MONO);
    doc.text(
      tx('report.results.scen.probability', 'Probability').toUpperCase(),
      statX,
      y + 4,
    );
    setText(doc, colors.fg, 36, 'bold', FONT_SERIF);
    doc.text(s.probability, statX, y + 22);
    bar(doc, statX, y + 26, statW, pct, colors.fg);
    setText(doc, INK_MUTE, 6.5, 'normal', FONT_MONO);
    doc.text(
      (en ? 'Model-estimated likelihood' : 'Probabilidad estimada').toUpperCase(),
      statX,
      y + 31,
    );

    // Body flows in the left 60% so it doesn't collide with the stat.
    const bodyW = CONTENT_W - statW - 8;
    if (rest) {
      y = body(doc, y, rest, {
        indent: MARGIN_X,
        maxWidth: bodyW,
        color: INK_SOFT,
        size: 11,
        family: FONT_SERIF,
        leading: 6,
        trailingGap: 4,
      });
    } else {
      y += 34;
    }
    y = Math.max(y, yIn + 110); // ensure we cleared the stat block
  } else if (rest) {
    // No probability — body flows full-width in 2 columns.
    y = bodyColumns(doc, MARGIN_X, y, CONTENT_W, rest, 2, {
      size: 11,
      family: FONT_SERIF,
      color: INK_SOFT,
      leading: 6,
      gap: 8,
    });
  }
  y += 6;

  // ── Action sidebar (3 columns, all on this page) ───────────────
  const lists: Array<[string[] | undefined, string, string]> = [
    [s.opportunities, tx('report.results.scen.opps', 'Opportunities'), GREEN],
    [s.threats, tx('report.results.scen.threats', 'Threats'), RED],
    [s.successFactors, tx('report.results.scen.success', 'Success factors'), GOLD],
  ];
  const cols = lists.filter(([items]) => (items?.length ?? 0) > 0);
  if (cols.length > 0) {
    y = checkY(doc, y + 2, 50);
    // Rule above the action block for editorial separation
    doc.setDrawColor(LINE_STRONG);
    doc.setLineWidth(0.25);
    doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
    y += 8;
    const colGap = 6;
    const colW = (CONTENT_W - colGap * (cols.length - 1)) / cols.length;
    const colStartY = y;
    let maxColY = colStartY;
    for (let i = 0; i < cols.length; i++) {
      const [items, label, color] = cols[i];
      const colX = MARGIN_X + (colW + colGap) * i;
      let cy = colStartY;
      // Section kicker
      setText(doc, color, 7.5, 'bold', FONT_MONO);
      doc.text(label.toUpperCase(), colX, cy);
      doc.setDrawColor(color);
      doc.setLineWidth(0.4);
      doc.line(colX, cy + 2, colX + 14, cy + 2);
      // Count badge
      const count = items?.length ?? 0;
      setText(doc, INK_MUTE, 7, 'bold', FONT_MONO);
      doc.text(String(count).padStart(2, '0'), colX + colW - 6, cy);
      cy += 8;
      cy = dotBullets(doc, cy, items ?? [], color, {
        indent: colX,
        maxWidth: colW - 4,
        size: 9.5,
        textColor: INK_SOFT,
      });
      maxColY = Math.max(maxColY, cy);
    }
    y = maxColY + 4;
  }

  // ── First-move pull-out ────────────────────────────────────────
  if (s.firstMove) {
    y = checkY(doc, y + 2, 24);
    const innerW = CONTENT_W - 16;
    const fmH = measureBody(doc, s.firstMove, { size: 11.5, family: FONT_SANS, maxWidth: innerW, leading: 6.2 }) + 14;
    card(doc, MARGIN_X, y, CONTENT_W, fmH, {
      fill: SURFACE_2,
      border: LINE_ACCENT,
      stripe: GOLD,
    });
    setText(doc, GOLD, 7.5, 'bold', FONT_MONO);
    doc.text(
      tx('report.results.scen.firstmove', 'First move').toUpperCase(),
      MARGIN_X + 8,
      y + 7,
    );
    setText(doc, INK_MUTE, 6.5, 'normal', FONT_MONO);
    doc.text(
      (en ? 'Concrete action to activate this scenario' : 'Acción concreta para activar este escenario').toUpperCase(),
      MARGIN_X + 8,
      y + 11.5,
    );
    body(doc, y + 17, s.firstMove, {
      indent: MARGIN_X + 8,
      maxWidth: innerW,
      color: INK,
      size: 11.5,
      family: FONT_SANS,
      leading: 6.2,
      trailingGap: 0,
    });
    y += fmH + 4;
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
    y = standfirst(doc, MARGIN_X, y, CONTENT_W * 0.9, sp.intro, {
      size: 13,
      color: INK,
      leading: 7.4,
    });
    y += 6;
  }

  // ── Driving forces — 2-column grid ────────────────────────────
  if (sp.drivingForces?.length) {
    y = sectionLabel(doc, y, tx('report.results.sp.forces', 'Driving forces of change'));
    const forces = [...sp.drivingForces].sort((a, b) => a.rank - b.rank);
    const gap = 6;
    const colW = (CONTENT_W - gap) / 2;
    for (let i = 0; i < forces.length; i += 2) {
      const pair = forces.slice(i, i + 2);
      const heights = pair.map((f) => measureDrivingForceCard(doc, f, colW));
      const rowH = Math.max(...heights);
      y = checkY(doc, y, rowH + 4);
      pair.forEach((f, idx) => {
        const x = MARGIN_X + idx * (colW + gap);
        drawDrivingForceCard(doc, x, y, colW, rowH, f);
      });
      y += rowH + gap;
    }
    y += 4;
  }

  // ── Axes — featured 2-column spread ────────────────────────────
  if (sp.axes?.length) {
    y = sectionLabel(doc, y, tx('report.results.sp.axesTitle', 'Critical uncertainty axes'));
    const colGap = 8;
    const colW = (CONTENT_W - colGap) / 2;
    let leftY = y;
    let rightY = y;
    sp.axes.forEach((ax, i) => {
      const colX = i === 0 ? MARGIN_X : MARGIN_X + colW + colGap;
      const targetY = i === 0 ? leftY : rightY;
      const endY = renderAxisCard(doc, colX, targetY, colW, ax);
      if (i === 0) leftY = endY;
      else rightY = endY;
    });
    y = Math.max(leftY, rightY) + 4;
  }

  // ── Scenario logics — 3 narrow cards in a row ──────────────────
  if (sp.scenarioLogics?.length) {
    y = sectionLabel(doc, y, tx('report.results.sp.logics', 'Narrative logic per scenario'));
    const n = sp.scenarioLogics.length;
    const gap = 6;
    const colW = (CONTENT_W - gap * (n - 1)) / n;
    // Compute uniform height across the row for visual rhythm
    const heights = sp.scenarioLogics.map((l) => measureScenarioLogicCard(doc, l, colW));
    const rowH = Math.max(...heights);
    y = checkY(doc, y, rowH + 4);
    sp.scenarioLogics.forEach((l, i) => {
      const x = MARGIN_X + i * (colW + gap);
      drawScenarioLogicCard(doc, x, y, colW, rowH, l, i);
    });
    y += rowH + 4;
  }
  return y;
}

function measureDrivingForceCard(doc: jsPDF, f: DrivingForce, w: number): number {
  const innerPad = 6;
  const innerW = w - innerPad * 2;
  setText(doc, INK, 11.5, 'bold', FONT_SERIF);
  const titleLines = doc.splitTextToSize(f.title, innerW - 16) as string[];
  const titleH = titleLines.length * 6;
  const descH = f.description
    ? measureBody(doc, f.description, { size: 9.5, family: FONT_SANS, maxWidth: innerW - 14, leading: 5 })
    : 0;
  return innerPad + Math.max(titleH, 14) + 4 + descH + innerPad - 2;
}

function drawDrivingForceCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  f: DrivingForce,
) {
  const score = Math.max(0, Math.min(100, Math.round(f.impactScore ?? 0)));
  const innerPad = 6;
  const innerW = w - innerPad * 2;
  card(doc, x, y, w, h, { fill: SURFACE_1, stripe: GOLD });
  // Big rank numeral on the left
  setText(doc, GOLD, 24, 'bold', FONT_SERIF);
  doc.text(`${f.rank}`, x + innerPad + 1, y + innerPad + 13);
  // Score top-right
  setText(doc, GOLD, 13, 'bold', FONT_MONO);
  const scoreStr = `${score}%`;
  const scoreW = doc.getTextWidth(scoreStr);
  doc.text(scoreStr, x + w - innerPad - scoreW, y + innerPad + 6);
  // Title
  setText(doc, INK, 11.5, 'bold', FONT_SERIF);
  const titleX = x + innerPad + 14;
  const titleMaxW = innerW - 14 - scoreW - 3;
  const titleLines = doc.splitTextToSize(f.title, titleMaxW) as string[];
  let ty = y + innerPad + 5;
  for (const ln of titleLines) {
    doc.text(ln, titleX, ty);
    ty += 6;
  }
  // Mini bar under the title row
  const barW = innerW - 14;
  bar(doc, titleX, ty + 1, barW, score, GOLD);
  ty += 5;
  // Description
  if (f.description) {
    body(doc, ty, f.description, {
      indent: titleX,
      maxWidth: titleMaxW + 14 - 4,
      color: INK_SOFT,
      size: 9.5,
      leading: 5,
      trailingGap: 0,
    });
  }
}

function renderAxisCard(
  doc: jsPDF,
  x: number,
  yIn: number,
  w: number,
  a: UncertaintyAxis,
): number {
  const innerPad = 7;
  const innerW = w - innerPad * 2;
  const labelLines = doc.splitTextToSize(a.label, innerW) as string[];
  const labelH = labelLines.length * 6.5;
  const poleLowH = a.poleLow
    ? measureBody(doc, a.poleLow, { size: 9.5, family: FONT_SANS, maxWidth: innerW - 7, leading: 4.9 })
    : 0;
  const poleHighH = a.poleHigh
    ? measureBody(doc, a.poleHigh, { size: 9.5, family: FONT_SANS, maxWidth: innerW - 7, leading: 4.9 })
    : 0;
  const rationaleH = a.rationale
    ? 6 + measureBody(doc, a.rationale, { size: 9, family: FONT_SANS, maxWidth: innerW, leading: 4.7 })
    : 0;
  const cardH = innerPad + labelH + 5 + poleLowH + 4 + poleHighH + 6 + rationaleH + innerPad - 2;
  const y = checkY(doc, yIn, cardH + 4);
  card(doc, x, y, w, cardH, { fill: SURFACE_1 });
  setText(doc, INK, 12, 'bold', FONT_SERIF);
  let ty = y + innerPad + 4;
  for (const ln of labelLines) {
    doc.text(ln, x + innerPad, ty);
    ty += 6.5;
  }
  if (a.poleLow) {
    pill(doc, x + innerPad, ty + 1, '−', RED, RED_BG);
    ty = body(doc, ty, a.poleLow, {
      indent: x + innerPad + 7,
      maxWidth: innerW - 7,
      size: 9.5,
      color: INK_SOFT,
      leading: 4.9,
      trailingGap: 1,
    });
  }
  if (a.poleHigh) {
    pill(doc, x + innerPad, ty + 1, '+', GREEN, GREEN_BG);
    ty = body(doc, ty, a.poleHigh, {
      indent: x + innerPad + 7,
      maxWidth: innerW - 7,
      size: 9.5,
      color: INK_SOFT,
      leading: 4.9,
      trailingGap: 1,
    });
  }
  if (a.rationale) {
    setText(doc, GOLD, 7, 'bold', FONT_MONO);
    doc.text(tx('report.results.sp.rationale', 'Rationale').toUpperCase(), x + innerPad, ty + 4);
    body(doc, ty + 8, a.rationale, {
      indent: x + innerPad,
      maxWidth: innerW,
      size: 9,
      color: INK_MUTE,
      leading: 4.7,
      trailingGap: 0,
    });
  }
  return y + cardH + 4;
}

function measureScenarioLogicCard(doc: jsPDF, l: ScenarioLogic, w: number): number {
  const innerPad = 6;
  const innerW = w - innerPad * 2;
  const logicH = l.logic
    ? measureBody(doc, l.logic, { size: 9.5, family: FONT_SANS, maxWidth: innerW, leading: 5 })
    : 0;
  return innerPad + 14 + logicH + innerPad - 2;
}

function drawScenarioLogicCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  l: ScenarioLogic,
  idx: number,
) {
  const colors = scenarioColors(undefined, idx);
  const innerPad = 6;
  const innerW = w - innerPad * 2;
  card(doc, x, y, w, h, { fill: SURFACE_1, stripe: colors.fg });
  // Number
  setText(doc, colors.fg, 7, 'bold', FONT_MONO);
  doc.text(String(idx + 1).padStart(2, '0'), x + innerPad + 1, y + innerPad + 4);
  // Name in serif
  setText(doc, colors.fg, 12, 'bold', FONT_SERIF);
  const nameLines = doc.splitTextToSize(l.name, innerW) as string[];
  let ty = y + innerPad + 10;
  for (const ln of nameLines.slice(0, 2)) {
    doc.text(ln, x + innerPad + 1, ty);
    ty += 5.5;
  }
  if (l.logic) {
    body(doc, ty + 1, l.logic, {
      indent: x + innerPad + 1,
      maxWidth: innerW,
      color: INK_SOFT,
      size: 9.5,
      leading: 5,
      trailingGap: 0,
    });
  }
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
    y = renderBackcastingEntry(doc, y, entries[i], i);
    if (i < entries.length - 1) y = rule(doc, y + 2, LINE_STRONG) + 4;
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
  // Type pill
  pill(doc, MARGIN_X, y + 4, e.scenarioType ?? '', colors.fg, colors.bg);
  y += 10;
  // Scenario name
  setText(doc, INK, 22, 'bold', FONT_SERIF);
  const nameLines = doc.splitTextToSize(e.scenarioName ?? '', CONTENT_W) as string[];
  for (const ln of nameLines) {
    y = checkY(doc, y, 9);
    doc.text(ln, MARGIN_X, y);
    y += 9;
  }
  y += 2;
  doc.setDrawColor(colors.fg);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_X, y, MARGIN_X + 24, y);
  y += 8;

  if (e.visionStatement) {
    y = subLabel(doc, y, (tx('report.results.bc.vision', 'Vision —').replace(/[—–-]\s*$/, '').trim()), colors.fg);
    y = body(doc, y, e.visionStatement, {
      color: INK,
      size: 12.5,
      family: FONT_SERIF,
      weight: 'italic',
      leading: 6.6,
      trailingGap: 8,
    });
  }

  if (e.milestones?.length) {
    // Vertical timeline rail down the left side.
    const railX = MARGIN_X + 8;
    const railTop = y;
    for (const m of e.milestones) y = renderMilestone(doc, y, m, colors.fg, railX);
    // Draw rail after all milestones so the height is known.
    doc.setDrawColor(colors.fg);
    doc.setLineWidth(0.6);
    doc.line(railX, railTop - 2, railX, y - 6);
  }

  if (e.startingPoint) {
    y = subLabel(doc, y, tx('report.results.bc.start', 'Starting point'), colors.fg);
    y = body(doc, y, e.startingPoint, {
      color: INK_SOFT,
      size: 10.5,
      leading: 5.5,
      trailingGap: 4,
    });
  }
  return y;
}

function renderMilestone(
  doc: jsPDF,
  yIn: number,
  m: BackcastingMilestone,
  accent: string,
  railX: number,
): number {
  const indent = railX + 6;
  const maxWidth = CONTENT_W - (indent - MARGIN_X);
  const titleLines = doc.splitTextToSize(m.title ?? '', maxWidth) as string[];
  const titleH = titleLines.length * 6.2;
  const descH = m.description
    ? measureBody(doc, m.description, { size: 10, family: FONT_SANS, maxWidth, leading: 5.3 })
    : 0;
  let actionsH = 0;
  if (m.actions?.length) {
    const size = 9.5;
    const leading = size * 0.55;
    for (const a of m.actions) {
      const lines = doc.splitTextToSize(a, maxWidth - 4) as string[];
      actionsH += lines.length * leading + 0.6;
    }
    actionsH += 2;
  }
  const blockH = 8 + titleH + descH + actionsH + 4;
  let y = checkY(doc, yIn, blockH + 4);
  // Year badge — circular gold node on the rail
  doc.setFillColor(BG);
  doc.circle(railX, y + 4, 3.2, 'F');
  doc.setDrawColor(accent);
  doc.setLineWidth(0.6);
  doc.circle(railX, y + 4, 3.2, 'S');
  setText(doc, accent, 8, 'bold', FONT_MONO);
  const yr = m.year ?? '';
  const yrW = doc.getTextWidth(yr);
  doc.text(yr, railX - yrW / 2, y + 1);

  // Title
  setText(doc, INK, 12, 'bold', FONT_SERIF);
  let ty = y + 5;
  for (const ln of titleLines) {
    doc.text(ln, indent, ty);
    ty += 6.2;
  }
  if (m.description) {
    ty = body(doc, ty + 1, m.description, {
      indent,
      maxWidth,
      color: INK_SOFT,
      size: 10,
      leading: 5.3,
      trailingGap: 1,
    });
  }
  if (m.actions?.length) {
    ty = dotBullets(doc, ty + 1, m.actions, accent, {
      indent,
      maxWidth,
      size: 9.5,
      textColor: INK_SOFT,
    });
  }
  return ty + 4;
}

/* ── Section: Strategic Map ───────────────────────────────────────── */

/**
 * Strategic map — 3-column horizon strip. Each horizon (H1/H2/H3) is
 * a column; priorities stack vertically within each column. This is
 * the on-screen tab's most powerful at-a-glance layout — three
 * timeframes visible together — and it ports cleanly to print.
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
  const visible = order.filter((h) => items.some((it) => it.horizon === h));
  if (visible.length === 0) return y;

  const gap = 6;
  const colW = (CONTENT_W - gap * (visible.length - 1)) / visible.length;
  // Column headers
  const headerY = y;
  visible.forEach((h, i) => {
    const x = MARGIN_X + i * (colW + gap);
    const color = horizonColors[h];
    setText(doc, color, 28, 'bold', FONT_SERIF);
    doc.text(h, x, headerY + 4);
    setText(doc, INK, 10, 'bold', FONT_SANS);
    doc.text(tx(`report.results.str.${h.toLowerCase()}`, h), x, headerY + 12);
    doc.setDrawColor(color);
    doc.setLineWidth(0.5);
    doc.line(x, headerY + 16, x + 18, headerY + 16);
  });
  y = headerY + 22;

  // Render each column's cards independently and track the max y.
  let maxY = y;
  visible.forEach((h, i) => {
    const x = MARGIN_X + i * (colW + gap);
    const color = horizonColors[h];
    let cy = y;
    const group = items.filter((it) => it.horizon === h);
    for (const it of group) {
      cy = renderPriorityCardCol(doc, x, cy, colW, it, color);
    }
    maxY = Math.max(maxY, cy);
  });
  return maxY + 4;
}

/**
 * Render a priority card inside a horizon column. Same look-and-feel
 * as the full-width version, but the layout adapts to the narrower
 * column (impact pill below the title rather than right-aligned).
 */
function renderPriorityCardCol(
  doc: jsPDF,
  x: number,
  yIn: number,
  w: number,
  it: StrategicPriority,
  horizonColor: string,
): number {
  const colors = impactColors(it.impact);
  const innerPad = 6;
  const innerW = w - innerPad * 2;
  setText(doc, INK, 11.5, 'bold', FONT_SERIF);
  const titleLines = doc.splitTextToSize(it.title, innerW) as string[];
  const titleH = titleLines.length * 6;
  let actionsH = 0;
  if (it.actions?.length) {
    const size = 9;
    const leading = size * 0.55;
    for (const a of it.actions) {
      const lines = doc.splitTextToSize(a, innerW - 4) as string[];
      actionsH += lines.length * leading + 0.4;
    }
    actionsH += 2;
  }
  const tframeH = it.timeframe ? 5 : 0;
  const cardH = innerPad + titleH + 5 + tframeH + actionsH + innerPad - 2;
  const y = checkY(doc, yIn, cardH + 4);
  card(doc, x, y, w, cardH, { fill: SURFACE_1, stripe: horizonColor });

  // Impact pill in the top-right corner of the card
  const label = impactLabel(it.impact).toUpperCase();
  setText(doc, colors.fg, 6.8, 'bold', FONT_MONO);
  const labelW = doc.getTextWidth(label) + 5;
  doc.setFillColor(colors.bg);
  doc.roundedRect(x + w - innerPad - labelW, y + innerPad - 2, labelW, 4.2, 1.2, 1.2, 'F');
  setText(doc, colors.fg, 6.8, 'bold', FONT_MONO);
  doc.text(label, x + w - innerPad - labelW + 2.5, y + innerPad + 1);

  // Title
  setText(doc, INK, 11.5, 'bold', FONT_SERIF);
  let ty = y + innerPad + 5;
  for (const ln of titleLines) {
    doc.text(ln, x + innerPad + 1, ty);
    ty += 6;
  }
  if (it.timeframe) {
    setText(doc, INK_MUTE, 8.5, 'italic', FONT_SERIF);
    doc.text(it.timeframe, x + innerPad + 1, ty);
    ty += 5;
  }
  if (it.actions?.length) {
    ty = dotBullets(doc, ty + 1, it.actions, horizonColor, {
      indent: x + innerPad + 1,
      maxWidth: innerW - 2,
      size: 9,
      textColor: INK_SOFT,
    });
  }
  return y + cardH + 4;
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
  const innerPad = 6;
  const innerW = w - innerPad * 2;
  const titleLines = doc.splitTextToSize(s.title, innerW - 14) as string[];
  const titleH = titleLines.length * 5.8;
  const dimH = s.dimension ? 4.5 : 0;
  const descH = s.description
    ? measureBody(doc, s.description, { size: 9.5, family: FONT_SANS, maxWidth: innerW - 14, leading: 5 })
    : 0;
  return innerPad + Math.max(titleH, 9) + dimH + descH + innerPad - 2;
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
  const innerPad = 6;
  const innerW = w - innerPad * 2;
  card(doc, x, y, w, h, { fill: SURFACE_1 });
  // Letter badge
  const initial = (s.dimension ?? '').trim().charAt(0).toUpperCase() || '•';
  doc.setFillColor(colors.bg);
  doc.roundedRect(x + innerPad, y + innerPad - 1, 9, 9, 1.5, 1.5, 'F');
  setText(doc, colors.fg, 9, 'bold', FONT_MONO);
  const iw = doc.getTextWidth(initial);
  doc.text(initial, x + innerPad + 4.5 - iw / 2, y + innerPad + 5);
  // Title
  setText(doc, INK, 11, 'bold', FONT_SANS);
  const titleX = x + innerPad + 13;
  const titleMaxW = innerW - 13;
  const titleLines = doc.splitTextToSize(s.title, titleMaxW) as string[];
  let ty = y + innerPad + 5;
  for (const ln of titleLines) {
    doc.text(ln, titleX, ty);
    ty += 5.8;
  }
  if (s.dimension) {
    setText(doc, colors.fg, 7.5, 'bold', FONT_MONO);
    doc.text(s.dimension.toUpperCase(), titleX, ty);
    ty += 4.5;
  }
  if (s.description) {
    body(doc, ty + 1, s.description, {
      indent: titleX,
      maxWidth: titleMaxW,
      color: INK_SOFT,
      size: 9.5,
      leading: 5,
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
    y = checkY(doc, y, 14);
    // Index numeral
    setText(doc, GOLD, 9, 'bold', FONT_MONO);
    const idx = String(i + 1).padStart(2, '0');
    doc.text(idx, MARGIN_X, y);
    // Title
    setText(doc, INK, 10.5, 'bold', FONT_SANS);
    const titleLines = doc.splitTextToSize(it.title || it.url || '—', CONTENT_W - 14) as string[];
    let ty = y;
    for (const ln of titleLines) {
      ty = checkY(doc, ty, 5.5);
      doc.text(ln, MARGIN_X + 12, ty);
      ty += 5.5;
    }
    if (it.url) {
      setText(doc, INK_MUTE, 8.5, 'italic', FONT_MONO);
      const urlLines = doc.splitTextToSize(it.url, CONTENT_W - 14) as string[];
      for (const ln of urlLines) {
        ty = checkY(doc, ty, 4.5);
        doc.text(ln, MARGIN_X + 12, ty);
        ty += 4.5;
      }
    }
    if (it.description) {
      ty = body(doc, ty, it.description, {
        indent: MARGIN_X + 12,
        maxWidth: CONTENT_W - 14,
        color: INK_SOFT,
        size: 9.5,
        family: FONT_SANS,
        leading: 5,
        trailingGap: 0,
      });
    }
    y = ty + 4;
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

export async function exportReportPdf(report: ReportResponse) {
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

  // Continue on the same opening-spread page if there's room, else add.
  if (
    (input.globalSteep && Object.values(input.globalSteep).some((v) => (v ?? '').trim().length > 0)) ||
    (input.steep && Object.values(input.steep).some((v) => (v ?? '').trim().length > 0))
  ) {
    // Always start STEEP on a fresh page — it's a dense block.
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
