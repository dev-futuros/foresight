import jsPDF from 'jspdf';
import i18n from '../i18n';
import type {
  BackcastingEntry,
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
import {
  runFitPass,
  persistTightened,
  pickText,
  type FieldNeed,
  type TightenedMap,
} from './pdfFit';

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
//
// Tokens are mutable so we can swap to a print-friendly light scheme via
// {@link setTheme} at the start of {@link exportReportPdf}. Renderers reference
// these by name — they NEVER hard-code hex values — so every paint, fill, and
// stroke flips palette consistently when the theme is changed.

export type PdfTheme = 'dark' | 'light';

let activeTheme: PdfTheme = 'dark';

let BG = '#0a0a0d';
let SURFACE_1 = '#11111a';
let SURFACE_2 = '#17171f';
let SURFACE_3 = '#1f1f29';

let INK = '#f4efe5';
let INK_SOFT = '#bcb6ac';
let INK_MUTE = '#7d7872';
let INK_FAINT = '#403d39';

let GOLD = '#d4a853';
let GOLD_BG = '#1f1a0d';

let GREEN = '#6ee7b7';
let GREEN_BG = '#0e2018';
let BLUE = '#93bff8';
let BLUE_BG = '#0e1622';
let ORANGE = '#fbb77b';
let ORANGE_BG = '#22160d';
let PURPLE = '#d6bdfb';
let PURPLE_BG = '#170e22';
let RED = '#fb8e8e';
let RED_BG = '#220d0d';

let LINE = '#1f1f25';
let LINE_STRONG = '#2c2c34';
let LINE_ACCENT = '#3a2f17';

/**
 * Apply a theme palette. Called once at the start of {@link exportReportPdf}
 * before any rendering. Tokens are intentionally module-scoped so every
 * downstream renderer picks up the new palette without a parameter cascade.
 *
 * <p>The light palette is designed for print: white paper background,
 * darker accent colours (gold / green / blue / purple / red) chosen for ~5:1
 * contrast against white at the chip-pill scale we use throughout the report.
 * Tinted-background variants (GOLD_BG, GREEN_BG, …) become very pale tints
 * suitable for filled card backgrounds on a white page.
 */
function setTheme(theme: PdfTheme): void {
  activeTheme = theme;
  if (theme === 'light') {
    BG = '#ffffff';
    SURFACE_1 = '#f6f3eb';
    SURFACE_2 = '#ede9dd';
    SURFACE_3 = '#e1dcca';

    INK = '#15151a';
    INK_SOFT = '#3d3b35';
    INK_MUTE = '#807a70';
    INK_FAINT = '#b4b0a8';

    // Accent palette tuned for white paper. Deliberately COOL-LEANING — emerald
    // green, royal blue, magenta-purple, teal, raspberry — so every non-brand
    // accent reads as clearly distinct from the warm gold. Each colour sits at
    // 60-70% saturation, the sweet spot where it pops as an editorial accent
    // without competing with body text for attention.
    //
    // GOLD is the only warm hue on the page (brand-primary). Every other slot
    // — STEEP dimensions, 3P scenarios, signals, horizons, impact tags — pulls
    // from the cool side of the wheel so the brand gold always wins visually.
    GOLD = '#c8881a'; // warm amber (brand-primary)
    GOLD_BG = '#fbeac4';

    GREEN = '#22c55e'; // light green — fresher and brighter than the prior emerald
    GREEN_BG = '#d3f5df';
    BLUE = '#1d4dd0'; // royal blue
    BLUE_BG = '#d4def8';
    // "ORANGE" slot retained for API compatibility but recoloured to a deep
    // TEAL — the warm orange clashed with the gold brand colour on print.
    ORANGE = '#0a8a92'; // teal (replaces the original orange slot)
    ORANGE_BG = '#cde8ea';
    PURPLE = '#9d27c8'; // magenta-purple
    PURPLE_BG = '#ecd0f7';
    RED = '#d12f5d'; // raspberry — cooler than pure red, still reads "negative"
    RED_BG = '#fad2dc';

    LINE = '#d4cebd';
    LINE_STRONG = '#a39c8a';
    LINE_ACCENT = '#e0c167';
  } else {
    // Dark (default) — values mirror the on-screen brand tokens.
    BG = '#0a0a0d';
    SURFACE_1 = '#11111a';
    SURFACE_2 = '#17171f';
    SURFACE_3 = '#1f1f29';

    INK = '#f4efe5';
    INK_SOFT = '#bcb6ac';
    INK_MUTE = '#7d7872';
    INK_FAINT = '#403d39';

    GOLD = '#d4a853';
    GOLD_BG = '#1f1a0d';

    GREEN = '#6ee7b7';
    GREEN_BG = '#0e2018';
    BLUE = '#93bff8';
    BLUE_BG = '#0e1622';
    ORANGE = '#fbb77b';
    ORANGE_BG = '#22160d';
    PURPLE = '#d6bdfb';
    PURPLE_BG = '#170e22';
    RED = '#fb8e8e';
    RED_BG = '#220d0d';

    LINE = '#1f1f25';
    LINE_STRONG = '#2c2c34';
    LINE_ACCENT = '#3a2f17';
  }
}
// Reference activeTheme so the variable isn't flagged as unused — exposed for
// any caller that wants to introspect the current palette mid-export.
void activeTheme;

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
  // Record the current section on this fresh page so the post-render
  // footer pass paints the rotated eyebrow + colored page chip even
  // when content spills across pages of the same section.
  markSectionOnCurrentPage(doc);
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
    /** When true, suppress the per-line {@link checkY} call so the caller can
     *  guarantee side-by-side layouts (e.g. STEEP bands) stay on a single page.
     *  If content overflows the page footer, jsPDF still draws the lines — the
     *  caller is expected to have pre-measured / shortened upstream. */
    noPaginate?: boolean;
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
      if (!opts.noPaginate) y = checkY(doc, y, leading + 1);
      doc.text(ln, indent, y);
      y += leading;
    }
    if (p < paragraphs.length - 1) y += paragraphGap;
  }
  return y + trailingGap;
}

/**
 * Strip XML-style citation / annotation tags the model occasionally emits in its prose —
 * notably {@code <cite index="…">…</cite>} pairs that surface in Anthropic web_search-grounded
 * outputs when the JSON envelope wasn't fully unescaped. We keep the WRAPPED content and drop
 * only the surrounding tags so the prose reads naturally in the PDF.
 *
 * <p>This runs on every text block before measure + render, so every section gets the cleanup
 * for free. Adding new tag families: extend the regex below.
 */
/**
 * Recursively walk a JSON-like tree and run {@link stripModelTags} on every string leaf.
 * Used to scrub AI-generated artefacts (XML-style {@code <cite>} tags, stray closing fragments)
 * from the entire report payload before the PDF pipeline measures or renders any text — no
 * single render site has to remember to call the strip.
 *
 * <p>Returns a new tree; the input is never mutated. Non-string leaves (numbers, booleans,
 * null) pass through untouched.
 */
function sanitizeTree<T>(node: T): T {
  if (typeof node === 'string') return stripModelTags(node) as unknown as T;
  if (Array.isArray(node)) {
    return node.map((v) => sanitizeTree(v)) as unknown as T;
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = sanitizeTree(v);
    }
    return out as unknown as T;
  }
  return node;
}

function stripModelTags(text: string): string {
  if (!text) return text;
  return text
    // Opening + closing cite/citation/source tags with arbitrary attributes
    .replace(/<\/?(?:cite|citation|source|ref)(?:\s+[^>]*)?>/gi, '')
    // Stray closing tag fragments the model sometimes leaves dangling
    .replace(/<\/(?:cite|citation|source|ref)>/gi, '')
    // Collapse any runs of whitespace the stripped tags left behind
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1');
}

/**
 * Split body text into paragraphs on either real newlines (`\n\n`)
 * or literal backslash-escape sequences (`\\n\\n`). The model
 * occasionally returns the latter when its JSON output isn't fully
 * unescaped during analysis — splitting on both keeps the rendered
 * body free of visible `\n` characters.
 *
 * <p>Also strips XML-style citation tags via {@link stripModelTags} so
 * downstream wrap measurements account for the cleaned text length.
 */
function splitParagraphs(text: string): string[] {
  return stripModelTags(text)
    .replace(/\\n/g, '\n')
    .split(/\n{2,}/);
}

/**
 * Non-paginating body renderer used by multi-column layouts where the
 * regular line-by-line {@link body} would invoke {@code checkY} and
 * shift the doc to a fresh page mid-draw — collapsing a side-by-side
 * spread into two stacked single-column pages.
 *
 * <p>Draws lines until adding the next would exceed {@code maxY}. If
 * the content doesn't all fit, the last line that fits is replaced
 * with the same text plus a trailing ellipsis, so readers see a clear
 * "more truncated" marker rather than an abrupt cut. Returns the y
 * after the last line drawn.
 */
function bodyClamped(
  doc: jsPDF,
  y: number,
  text: string,
  opts: {
    indent: number;
    maxWidth: number;
    maxY: number;
    color?: string;
    size?: number;
    family?: string;
    weight?: FontWeight;
    leading?: number;
    paragraphGap?: number;
    trailingGap?: number;
    /** Slot identifier for the console warning when content overflows. */
    where?: string;
  },
): number {
  const size = opts.size ?? 10.5;
  const leading = opts.leading ?? size * 0.55;
  const paragraphGap = opts.paragraphGap ?? leading * 0.7;
  setText(doc, opts.color ?? INK_SOFT, size, opts.weight ?? 'normal', opts.family ?? FONT_SANS);
  const paragraphs = splitParagraphs(text);
  let overflowed = false;
  for (let p = 0; p < paragraphs.length && !overflowed; p++) {
    const lines = doc.splitTextToSize(paragraphs[p].trim(), opts.maxWidth) as string[];
    for (let i = 0; i < lines.length; i++) {
      if (y + leading > opts.maxY) {
        // Out of vertical space — stop rendering to avoid spilling over the
        // page chrome. Per policy we DO NOT add a "…" truncation marker; the
        // dropped content is reported via the console warning instead so the
        // caller (and future iteration) can address it via shorter source
        // text or a different layout.
        overflowed = true;
        break;
      }
      doc.text(lines[i], opts.indent, y);
      y += leading;
    }
    if (overflowed) break;
    if (p < paragraphs.length - 1) y += paragraphGap;
  }
  if (overflowed) {
    warnOverflow(opts.where ?? 'bodyClamped', text, opts.maxWidth, 0);
  }
  return y + (opts.trailingGap ?? leading * 0.6);
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
  color: string = INK_MUTE,
  nextBlockH = 24,
): number {
  // Reserve enough space for the label plus the first content block
  // that follows. Without this, a label can land at the bottom of a
  // page while its content paginates to the next, leaving an orphan.
  //
  // Default colour is now INK_MUTE (neutral) instead of GOLD — structural
  // sub-labels are typographic, not accent. Callers can still pass a colour
  // for the rare case where a section genuinely wants its identity tint here.
  y = checkY(doc, y, 14 + nextBlockH);
  setText(doc, color, 8, 'bold', FONT_MONO);
  doc.text(text.toUpperCase(), MARGIN_X, y);
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.25);
  doc.line(MARGIN_X, y + 2.5, PAGE_W - MARGIN_X, y + 2.5);
  return y + 11;
}

/**
 * @deprecated Compact mono-caps label used by the previous backcasting /
 * STEEP renderers. Replaced by {@link subheadCap} in the magazine pass —
 * kept around with `_` prefix so future helpers can resurrect it without
 * re-deriving the size + color combinations. Unused on purpose.
 */
function _subLabel(doc: jsPDF, y: number, text: string, color = GOLD): number {
  y = checkY(doc, y, 10);
  setText(doc, color, 7.5, 'bold', FONT_MONO);
  doc.text(text.toUpperCase(), MARGIN_X, y);
  return y + 6;
}
void _subLabel;

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
function kicker(doc: jsPDF, x: number, y: number, text: string, color = INK_MUTE, size = 7.5): number {
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
  // Record TOC entry on current page. The `color` arg is the section's accent
  // colour — only used for downstream chrome (rotated eyebrow, page chip) where
  // colour-as-identity is appropriate. The section-header numeral itself is
  // ALWAYS rendered in INK so all section numbers look identical across the
  // report (per user policy: "use colours only for accents").
  const num = String(tocEntries.length + 1).padStart(2, '0');
  const page = (doc.getCurrentPageInfo() as { pageNumber: number }).pageNumber;
  tocEntries.push({ num, title, page, color });

  y = checkY(doc, y, 32);
  // Left: numeral (dark grey) + kicker stacked. Numerals across the report —
  // page-header, TOC, 3P opener, brief, uncertainties — all use INK_SOFT so
  // the section/index numbers read as a quiet typographic marker rather than
  // pulling weight away from the actual title or label.
  setText(doc, INK_SOFT, 28, 'bold', FONT_SERIF);
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
  // Structural rule under the header — neutral grey, NOT the section colour
  // (rules are structural, not accents).
  ty = Math.max(ty, y + 16);
  ty += 2;
  doc.setDrawColor(LINE_STRONG);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, ty, PAGE_W - MARGIN_X, ty);
  return ty + 8;
}

/* ── Magazine typography primitives ────────────────────────────────── */

/**
 * Module-level tightened-text map. Set at the start of {@link renderReport} from the fit
 * pass; consumed by section renderers via the {@link T} accessor. Avoids threading the map
 * through every renderer's signature — most renderers only touch one or two text fields and
 * the call-site noise of an extra parameter outweighs the explicitness gain.
 */
let currentTightened: TightenedMap = {};

/**
 * Per-section layout choice — selected by {@link planLayouts} before the fit pass runs.
 * Each section can have one or more candidate layouts (declared in priority order); the
 * chooser picks the most-preferred layout whose budgets are within reasonable shortening
 * distance of the source content. Renderers read {@link layoutChoices} to decide which
 * variant to draw; {@link budgetFor} returns per-path caps under the chosen layouts.
 *
 * <p>Single-layout sections (Brief, Incertidumbres, Strategic Map, Wildcards) still appear
 * here so all field budgets live in one place — they just have a single entry.
 */
type SteepLayoutId = 'ideal' | 'one-per-page';
type ScenariosLayoutId = 'compact' | 'hero-firstmove';
type SignalsLayoutId = 'one-page' | 'two-page';
const layoutChoices: {
  steep: SteepLayoutId;
  scenarios: ScenariosLayoutId;
  signals: SignalsLayoutId;
} = {
  steep: 'ideal',
  scenarios: 'compact',
  signals: 'one-page',
};

/**
 * AI shortening budget — how aggressive AI is allowed to be relative to source length.
 * A value of 0.5 means AI may shorten a field up to 50% (i.e. budget is at least half the
 * source). Anything that would require MORE than this much shortening triggers the layout
 * chooser to step down to the next alternative.
 *
 * <p>Set conservatively: tightening to 40-50% of source still reads naturally; below that
 * the model has to cut substantive content (claims, statistics) and quality drops.
 */
const MAX_SHORTEN_RATIO = 0.6;

/**
 * Returns the per-path character budget under the currently chosen layouts. The render
 * seam at {@link T} reads this so the AI's tightened output fits the layout we committed
 * to drawing — never used as a truncation cap, only as a target for the AI.
 */
function budgetFor(path: string): number | undefined {
  // ── Brief — exec summary fits one page next to the BRIEF sidebar. 550 chars is
  // the sweet spot: leaves room for a 1-2 sentence italic standfirst plus a 2-col
  // body for the rest, with comfortable padding above the footer chime. At 700
  // the AI's output occasionally landed too long for the layout (the first
  // paragraph alone overflowed the page).
  if (path === 'executiveSummary') return 550;
  // ── STEEP — Social shares page 1 with the section title (limited room), the rest
  // get a dedicated page each. Social uses a tighter budget so it ALWAYS fits next to
  // the header; other dims can afford a looser cap. AI shortens anything above the
  // dim's cap, sources below it pass through untouched.
  if (path === 'steep.global.S' || path === 'steep.sectorial.S') {
    return 600;
  }
  if (path.startsWith('steep.global.') || path.startsWith('steep.sectorial.')) {
    return 1200;
  }
  // ── Incertidumbres (single layout) ──
  if (/^keyUncertainties\.\d+\.description$/.test(path)) return 220;
  // ── Scenarios (two candidates: compact vs hero-firstmove) ──
  if (/^scenarios\.\d+\.description$/.test(path)) {
    return layoutChoices.scenarios === 'compact' ? 450 : 800;
  }
  if (/^scenarios\.\d+\.firstMove$/.test(path)) {
    return layoutChoices.scenarios === 'compact' ? 180 : 300;
  }
  // ── Scenario Planning (single layout, logics on own page) ──
  if (path === 'scenarioPlanning.intro') return 350;
  if (/^scenarioPlanning\.drivingForces\.\d+\.description$/.test(path)) return 300;
  if (/^scenarioPlanning\.axes\.\d+\.rationale$/.test(path)) return 250;
  if (/^scenarioPlanning\.scenarioLogics\.\d+\.logic$/.test(path)) return 320;
  // ── Backcasting (single layout, one entry per page) ──
  if (/^backcasting\.\d+\.visionStatement$/.test(path)) return 250;
  if (/^backcasting\.\d+\.startingPoint$/.test(path)) return 240;
  if (/^backcasting\.\d+\.milestones\.\d+\.description$/.test(path)) return 220;
  // ── Strategic Map (single layout, 1 page per H) ──
  if (/^strategicMap\.\d+\.actions\.\d+$/.test(path)) return 160;
  // ── Signals (two candidates) ──
  if (/^weakSignals\.\d+\.description$/.test(path)) {
    return layoutChoices.signals === 'one-page' ? 200 : 400;
  }
  // ── Wildcards (single layout) ──
  if (/^wildcards\.\d+\.description$/.test(path)) return 380;
  return undefined;
}

/**
 * Decide whether the AI can plausibly shorten {@code source} down to {@code budget}
 * without sacrificing meaning. Used by the per-section layout chooser to pick between
 * "tight ideal" and "loose alternative" layouts based on actual content.
 *
 * <p>{@code source.length <= budget}: no shortening needed, trivial fit.
 * <p>{@code budget / source.length >= 1 - MAX_SHORTEN_RATIO}: AI can hit this with quality.
 * <p>Otherwise: too much shortening required — caller should try a looser layout.
 */
function fitsWithShortening(sourceLen: number, budget: number): boolean {
  if (sourceLen === 0) return true;
  if (sourceLen <= budget) return true;
  const ratio = budget / sourceLen;
  return ratio >= 1 - MAX_SHORTEN_RATIO;
}

/**
 * Pick the most-preferred layout for each section based on the source content's actual size.
 * Runs ONCE at the start of the export, before the fit pass, so {@link collectFieldNeeds}
 * and {@link T} both see the same chosen layout.
 *
 * <p>For STEEP, Scenarios, and Signals: walks the candidate layouts in priority order
 * (ideal → alternative) and picks the first whose per-field budget can absorb every
 * relevant source field within {@link MAX_SHORTEN_RATIO}. If no candidate fits, falls
 * back to the last (loosest) one — the AI is told to tighten as best it can; the
 * layout might breathe a bit wider but no content is lost.
 *
 * <p>Single-layout sections (Brief, Incertidumbres, Planning, Backcasting, Strategic Map,
 * Wildcards) are always rendered the same way; their budgets in {@link budgetFor} are
 * fixed.
 */
function planLayouts(_input: InputData, result: ResultData | null): void {
  // ── STEEP: single layout. The greedy packer in {@link renderSteepInputs} fits 1-3
  // bands per page based on pre-measured heights using the tightened text. We don't
  // pick between layouts — AI shortens anything above the per-side budget and the
  // packer figures out pagination.
  layoutChoices.steep = 'ideal';

  // ── Scenarios: compact (1 page each, firstMove inline box) vs hero-firstmove
  // (2 pages each, firstMove on its own centred hero page). All 3 scenarios MUST
  // use the same layout — the chooser picks the WORST CASE: if any scenario
  // would need too-aggressive shortening to fit compact, all three step up to
  // the hero variant.
  if (result?.scenarios?.length) {
    const allCompactFit = result.scenarios.every((sc) => {
      const descFits = fitsWithShortening(sc.description?.length ?? 0, 450);
      const fmFits = fitsWithShortening(sc.firstMove?.length ?? 0, 180);
      return descFits && fmFits;
    });
    layoutChoices.scenarios = allCompactFit ? 'compact' : 'hero-firstmove';
  } else {
    layoutChoices.scenarios = 'compact';
  }

  // ── Signals: one-page (all 5 on one page @ 200ch) vs two-page (3+2 split @ 400ch).
  if (result?.weakSignals?.length) {
    const allOnePageFit = result.weakSignals.every((w) =>
      fitsWithShortening(w.description?.length ?? 0, 200),
    );
    layoutChoices.signals = allOnePageFit ? 'one-page' : 'two-page';
  } else {
    layoutChoices.signals = 'one-page';
  }
}

/**
 * Tightened-text accessor used at the render seam in every section. Returns the AI-shortened
 * version of {@code source} when available for {@code path}, otherwise the source as-is.
 * NEVER truncates — the layout chooser upstream already picked a layout whose budget is
 * within reasonable AI-shortening distance of the source, so the AI's output is trusted
 * verbatim. Truncation would silently destroy meaning.
 */
function T(path: string, source: string | undefined | null): string {
  if (!source) return '';
  return pickText(currentTightened, path, source);
}

/**
 * Current section context — set by the major-section renderers via {@link setSection}
 * so the rotated eyebrow on the left margin (TIME's `[ THE GREAT DISRUPTER ]`) renders
 * on every page of that section. {@link pageSections} stores per-page snapshots so the
 * post-render footer pass can paint each page's correct eyebrow + chip even though the
 * `currentSection` variable has moved on by the time we revisit.
 */
let currentSection: { label: string; color: string } | null = null;
const pageSections: Record<number, { label: string; color: string }> = {};

function setSection(doc: jsPDF, label: string, color: string = GOLD): void {
  // ONLY update the module-level context — do NOT retag the current page. Every
  // setSection caller in this file is immediately followed by an addPage(), and
  // addPage's markSectionOnCurrentPage() picks up the new context for the freshly
  // created page. Retagging the current page here corrupts the previous section's
  // last page (it gets the NEW section's eyebrow + page-chip colour, even though
  // it still belongs to the old section's content).
  currentSection = { label, color };
  void doc; // doc retained in the signature for symmetry with addPage / markSection
}

/** Record the current section for the current page — call from `addPage` flows. */
function markSectionOnCurrentPage(doc: jsPDF): void {
  if (!currentSection) return;
  const page = (doc.getCurrentPageInfo() as { pageNumber: number }).pageNumber;
  pageSections[page] = currentSection;
}

/**
 * TIME-style rotated section eyebrow in the left margin. Reads bottom-up
 * (`[ SECTION NAME ]` in mono caps), anchored vertically near the page
 * centre. Drawn from the post-render footer pass so every page of a
 * section gets it regardless of when its content was added.
 */
function drawSectionEyebrow(doc: jsPDF, label: string, color: string = INK_MUTE): void {
  const text = `[  ${label.toUpperCase()}  ]`;
  setText(doc, color, 6.5, 'bold', FONT_MONO);
  // angle:90 rotates counter-clockwise so reading direction is bottom→top.
  // Anchor at x≈9mm (well within the 24mm left margin), vertically centred.
  const w = doc.getTextWidth(text);
  doc.text(text, 9, PAGE_H / 2 + w / 2, { angle: 90 });
}

/**
 * One coloured chunk of a multi-color headline. Used by {@link splitColorHeadline}
 * to render TIME-style "The AI Arms Race Is **Changing Everything**" titles where
 * each segment can be its own colour while still wrapping across the same line set.
 */
type HeadlineChunk = { text: string; color: string };

/**
 * Multi-color split headline. Each chunk's words flow into a shared text stream
 * with greedy word wrap at `w`; colour changes mid-stream as we cross chunk
 * boundaries. Returns the y position after the last rendered line.
 *
 * <p>Magazine pattern: split a headline into two semantic halves and paint the
 * second half in an accent colour so it pops on the spread.
 */
function splitColorHeadline(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  chunks: HeadlineChunk[],
  opts: { size?: number; leading?: number; family?: string; weight?: FontWeight } = {},
): number {
  const size = opts.size ?? 30;
  const leading = opts.leading ?? size * 0.42;
  const family = opts.family ?? FONT_SERIF;
  const weight = opts.weight ?? 'bold';
  doc.setFontSize(size);
  doc.setFont(family, weight);

  type Word = { text: string; color: string; isLast: boolean };
  const words: Word[] = [];
  for (let ci = 0; ci < chunks.length; ci++) {
    const c = chunks[ci];
    const tokens = c.text.split(/(\s+)/).filter((s) => s.length > 0);
    for (const t of tokens) {
      words.push({ text: t, color: c.color, isLast: false });
    }
    if (ci < chunks.length - 1 && words.length > 0) {
      const tail = words[words.length - 1];
      if (!/\s$/.test(tail.text)) {
        words.push({ text: ' ', color: c.color, isLast: false });
      }
    }
  }

  const lines: Word[][] = [];
  let line: Word[] = [];
  let lineW = 0;
  for (const wd of words) {
    const ww = doc.getTextWidth(wd.text);
    if (line.length > 0 && lineW + ww > w && !/^\s+$/.test(wd.text)) {
      // Strip trailing whitespace from the line before breaking.
      while (line.length > 0 && /^\s+$/.test(line[line.length - 1].text)) line.pop();
      lines.push(line);
      line = [];
      lineW = 0;
      if (/^\s+$/.test(wd.text)) continue;
    }
    line.push(wd);
    lineW += ww;
  }
  if (line.length > 0) lines.push(line);

  let cursorY = y;
  for (const ln of lines) {
    let cursorX = x;
    for (const wd of ln) {
      doc.setTextColor(wd.color);
      doc.text(wd.text, cursorX, cursorY);
      cursorX += doc.getTextWidth(wd.text);
    }
    cursorY += size + leading;
  }
  return cursorY;
}

/**
 * Magazine pull quote — bold all-caps serif with curly quotation marks,
 * set inline within a single column. Attribution renders below in
 * italic sans with an em-dash prefix.
 */
function pullQuote(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  text: string,
  attribution?: string,
  opts: { size?: number; color?: string } = {},
): number {
  const size = opts.size ?? 13;
  const leading = size * 0.7;
  const color = opts.color ?? INK;
  // Top accent rule
  doc.setDrawColor(color);
  doc.setLineWidth(0.45);
  doc.line(x, y, x + 18, y);
  y += 5;
  setText(doc, color, size, 'bold', FONT_SERIF);
  const wrapped = doc.splitTextToSize(`‘${text.toUpperCase()}’`, w) as string[];
  for (const ln of wrapped) {
    y = checkY(doc, y, leading + 2);
    doc.text(ln, x, y);
    y += leading;
  }
  if (attribution) {
    setText(doc, INK_SOFT, size * 0.58, 'italic', FONT_SANS);
    y = checkY(doc, y, leading + 1);
    doc.text(`— ${attribution}`, x, y + 2);
    y += leading;
  }
  return y + 4;
}

/**
 * TIME-style mid-article subhead — short ALL-CAPS coloured sans-serif
 * label that sits flush in column flow between two paragraphs.
 */
function subheadCap(
  doc: jsPDF,
  x: number,
  y: number,
  text: string,
  color: string,
  size = 8.5,
): number {
  y = checkY(doc, y, size + 4);
  setText(doc, color, size, 'bold', FONT_SANS);
  doc.text(text.toUpperCase(), x, y + 2);
  return y + size + 2;
}

/**
 * Magazine ranked numeral — huge bold serif used as a display anchor for
 * "01 / 02 / 03"-style feature blocks. `bigNumeral` itself does not return
 * a new y; it just paints the numeral at (x, y). Callers manage layout.
 */
function bigNumeral(
  doc: jsPDF,
  x: number,
  y: number,
  text: string,
  color: string,
  size = 60,
  family: string = FONT_SERIF,
): void {
  setText(doc, color, size, 'bold', family);
  doc.text(text, x, y);
}

/**
 * Partition body text across N equal-width columns side-by-side. Pre-measures
 * lines and distributes them greedily — fill column 1 to available height,
 * spill to column 2, etc. Supports an optional drop cap on the first
 * paragraph's first character (rendered in column 0).
 *
 * <p>jsPDF has no native multi-column primitive — this is the missing piece
 * that lets the rest of the editorial layout fall into place.
 */
function flowColumns(
  doc: jsPDF,
  x: number,
  y: number,
  totalW: number,
  text: string,
  opts: {
    columns?: number;
    gutter?: number;
    color?: string;
    size?: number;
    family?: string;
    leading?: number;
    weight?: FontWeight;
    dropCap?: { color: string; size?: number; lines?: number } | null;
    maxHeight?: number;
  } = {},
): number {
  const columns = opts.columns ?? 2;
  const gutter = opts.gutter ?? 5;
  const colW = (totalW - gutter * (columns - 1)) / columns;
  const size = opts.size ?? 9.5;
  const leading = opts.leading ?? size * 0.52;
  const color = opts.color ?? INK_SOFT;
  const family = opts.family ?? FONT_SERIF;
  const weight = opts.weight ?? 'normal';
  const maxH = opts.maxHeight ?? PAGE_BOTTOM - y;
  setText(doc, color, size, weight, family);

  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return y;

  // Drop cap pre-computation
  const dc = opts.dropCap ?? null;
  const dcSize = dc?.size ?? size * 5.4;
  const dcLineCount = dc?.lines ?? 3;
  let dcLetter = '';
  if (dc && paragraphs[0].length > 0) {
    dcLetter = paragraphs[0].charAt(0);
    paragraphs[0] = paragraphs[0].slice(1);
  }
  // Drop-cap glyph width in mm (jsPDF uses pt; mm = pt * 0.3527).
  setText(doc, color, dcSize, 'bold', FONT_SERIF);
  const dcW = dc ? doc.getTextWidth(dcLetter) + 1.5 : 0;
  setText(doc, color, size, weight, family);

  // Build the full line list. Lines from paragraph[0] that overlap the drop
  // cap are flagged so we know to indent them in column 0.
  type Line = { text: string; gapAfter: number; firstParaIndent: boolean };
  const lines: Line[] = [];
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const para = paragraphs[pi].trim();
    if (!para) continue;
    if (pi === 0 && dc) {
      // First N lines wrap at the narrower width (column - dropcap), the
      // rest at the full column width. Re-wrap the residual after the
      // dropcap-overlap region to keep type colour even.
      const narrowed = doc.splitTextToSize(para, colW - dcW) as string[];
      for (let i = 0; i < Math.min(narrowed.length, dcLineCount); i++) {
        lines.push({ text: narrowed[i], gapAfter: 0, firstParaIndent: true });
      }
      if (narrowed.length > dcLineCount) {
        const remainder = narrowed.slice(dcLineCount).join(' ');
        const wide = doc.splitTextToSize(remainder, colW) as string[];
        for (const ln of wide) {
          lines.push({ text: ln, gapAfter: 0, firstParaIndent: false });
        }
      }
    } else {
      const wrapped = doc.splitTextToSize(para, colW) as string[];
      for (const ln of wrapped) {
        lines.push({ text: ln, gapAfter: 0, firstParaIndent: false });
      }
    }
    if (pi < paragraphs.length - 1 && lines.length > 0) {
      lines[lines.length - 1].gapAfter = leading * 0.7;
    }
  }

  // Distribute lines across columns greedily, capped at maxH per column. When the last
  // column overflows we DON'T truncate — every line still gets pushed and rendered (it
  // will visually spill past maxH), but we log a console warning so the next iteration
  // or layout choice can address the offending content.
  const perCol: Line[][] = Array.from({ length: columns }, () => []);
  let col = 0;
  let used = 0;
  let overflowLines = 0;
  for (const ln of lines) {
    const need = leading + ln.gapAfter;
    if (used + need > maxH && col < columns - 1) {
      col++;
      used = 0;
    }
    if (col === columns - 1 && used + need > maxH) overflowLines++;
    perCol[col].push(ln);
    used += need;
  }
  if (overflowLines > 0) {
    warnOverflow(`flowColumns (${columns}-col)`, text, colW, columns);
  }

  // Draw each column.
  let deepest = y;
  for (let c = 0; c < columns; c++) {
    const cx = x + c * (colW + gutter);
    let cy = y;
    if (c === 0 && dc) {
      setText(doc, dc.color, dcSize, 'bold', FONT_SERIF);
      // Anchor the drop cap baseline so its cap height aligns near the
      // first body line's baseline. The 0.74 factor matches Playfair's
      // cap-height ratio; adjust if swapping serif.
      doc.text(dcLetter, cx, cy + dcSize * 0.27);
    }
    setText(doc, color, size, weight, family);
    for (const ln of perCol[c]) {
      const ix = ln.firstParaIndent ? cx + dcW : cx;
      doc.text(ln.text, ix, cy);
      cy += leading + ln.gapAfter;
    }
    if (cy > deepest) deepest = cy;
  }
  return deepest + 2;
}

// Reserved magazine primitives — kept around for future iterations.
// `flowColumns` is now used by the Brief + Exec spread; `pullQuote` is
// still on deck for a future drop-cap / quote-anchored layout pass.
// `_measureScenarioLogicRow` is held for lookahead pagination if we
// ever flow scenario logics inline again.
void pullQuote;
void _measureScenarioLogicRow;
// Brief no longer renders a sidebar pull quote — the standfirst already shows the
// opening line, so a duplicated pull quote made the page stutter. Helpers kept for
// possible future use.
void renderMarginPullQuote;
void extractPullQuote;
// Scenario Planning unified its three subsections into a single row layout
// ({@link renderPlanningRow}); the hero / feature-page treatment is no longer
// invoked. Helpers retained in case a future iteration wants overflow heros back.
void renderDrivingForcesFeaturePage;
void renderDrivingForceHero;

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

// STEEP / dimension colour mappings. Every accent below is a COOL hue —
// gold is reserved for brand chrome (cover / back cover / footer wordmark)
// and never used as a dimension or section identity. The ORANGE slot is
// repainted to teal in the light palette, so E / Economic reads as a clearly
// distinct accent from technological's green.
function steepColor(k: 'S' | 'T' | 'E' | 'ENV' | 'P'): { fg: string; bg: string } {
  switch (k) {
    case 'S':
      return { fg: BLUE, bg: BLUE_BG };
    case 'T':
      return { fg: GREEN, bg: GREEN_BG };
    case 'E':
      return { fg: ORANGE, bg: ORANGE_BG }; // teal in light, amber in dark
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
      return { fg: ORANGE, bg: ORANGE_BG }; // teal in light, amber in dark
    case 'medioambiental':
    case 'environmental':
      return { fg: GREEN, bg: GREEN_BG };
    case 'político':
    case 'politico':
    case 'political':
      return { fg: PURPLE, bg: PURPLE_BG };
    default:
      // Fallback dimension — neutral mute rather than the brand gold.
      return { fg: INK_MUTE, bg: SURFACE_2 };
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
    // Auto-shrink the title to fit the right slot instead of truncating with an
    // ellipsis. The slot extends from just-after the FUTUROS wordmark to the right
    // margin; we step the font size down from 7.5 to a 5pt floor until the title
    // fits. If even 5pt overflows we log a warning and render at 5pt regardless
    // (the user prefers visual overflow to silent truncation).
    const wordmarkW = doc.getTextWidth('FUTUROS');
    const slotMaxW = (PAGE_W - MARGIN_X) - (MARGIN_X + wordmarkW + 6);
    let size = 7.5;
    setText(doc, INK_MUTE, size, 'normal', FONT_MONO);
    while (doc.getTextWidth(reportTitle) > slotMaxW && size > 5) {
      size -= 0.5;
      setText(doc, INK_MUTE, size, 'normal', FONT_MONO);
    }
    if (doc.getTextWidth(reportTitle) > slotMaxW) {
      warnOverflow('running head title', reportTitle, slotMaxW, 1);
    }
    const w = doc.getTextWidth(reportTitle);
    doc.text(reportTitle, PAGE_W - MARGIN_X - w, 14);
  }
  // Thin gold rule under the running head — brand element, ties every page
  // top to the cover's masthead language.
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.3);
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
  // Top-right meta — just the date, no "EDITION" label. Keeps the masthead
  // strip light so the gold rule below stays the dominant divider.
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
  // Eyebrow above the title: "STRATEGIC FORESIGHT REPORT" + "· N-YEAR HORIZON"
  // when a horizon is configured. Promotes the horizon onto the cover as
  // editorial meta instead of leaving it stranded in the bottom-right.
  const eyebrowParts = [tx('report.eyebrow', 'Strategic foresight report')];
  if (cp.horizon) {
    eyebrowParts.push(
      `${cp.horizon}-${en ? 'year horizon' : 'años de horizonte'}`,
    );
  }
  setText(doc, GOLD, 9.5, 'bold', FONT_MONO);
  doc.text(eyebrowParts.join(' · ').toUpperCase(), MARGIN_X, heroY);

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
  // Horizon now lives in the top eyebrow under the gold rule — leaving
  // the bottom row to consultant credit on the left and the "Generated
  // with Claude AI" colophon spanning the width.
  if (cp.consultantName || cp.consultantCompany) {
    const consultant = [cp.consultantName, cp.consultantCompany].filter(Boolean).join(' — ');
    setText(doc, INK_MUTE, 7.5, 'bold', FONT_MONO);
    doc.text((en ? 'Prepared by' : 'Preparado por').toUpperCase(), MARGIN_X, PAGE_H - 30);
    setText(doc, INK_SOFT, 13, 'italic', FONT_SERIF);
    doc.text(consultant, MARGIN_X, PAGE_H - 22);
  }
  // Bottom-most colophon row removed — the cover no longer carries the
  // "Generated with Claude AI" byline on the left nor the "Núm. 01" issue
  // mark on the right. The page chrome from {@link addFootersAndHeads} is
  // already skipped for the cover (loop starts at p=2), so nothing else
  // overprints this slot now.
}

/**
 * Back cover — final page of the report. Minimal centred composition modelled
 * on the user's reference image:
 *   • "Futuros" wordmark in display serif gold, centred.
 *   • Short gold hairline rule under the wordmark.
 *   • Tagline centred — lead clause in white, accent clause in gold, split at
 *     the comma so the closing verb phrase reads as the editorial punchline.
 *   • Matching short gold hairline rule under the tagline.
 *   • "futuros.io" caption underneath in mono gold.
 *
 * <p>Renders its own chrome — {@link addFootersAndHeads} is told to skip this
 * page so the standard running head / footer rule / page-number text don't
 * intrude on the closing spread.
 */
function renderBackCover(doc: jsPDF) {
  paintBackground(doc);
  const en = isEnLang();
  const cx = PAGE_W / 2;
  const centerY = PAGE_H / 2;

  // ── "Futuros" wordmark — title-case display serif in gold.
  setText(doc, GOLD, 22, 'normal', FONT_SERIF);
  doc.text('Futuros', cx, centerY - 36, { align: 'center' });
  // Short hairline rule under the wordmark.
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.4);
  doc.line(cx - 14, centerY - 26, cx + 14, centerY - 26);

  // ── Tagline. Split at the comma so the accent clause can render in gold.
  const tagline = en
    ? { lead: 'The future is not predicted,', accent: 'it is designed.' }
    : { lead: 'El futuro no se predice,', accent: 'se diseña.' };

  // Auto-shrink so both lines fit CONTENT_W at the chosen size.
  let taglineSize = 26;
  for (;;) {
    setText(doc, INK, taglineSize, 'normal', FONT_SERIF);
    const leadW = doc.getTextWidth(tagline.lead);
    const accentW = doc.getTextWidth(tagline.accent);
    if ((leadW <= CONTENT_W && accentW <= CONTENT_W) || taglineSize <= 18) break;
    taglineSize -= 2;
  }
  const lineLead = taglineSize * 0.55;

  // Line 1 — white lead clause.
  setText(doc, INK, taglineSize, 'normal', FONT_SERIF);
  doc.text(tagline.lead, cx, centerY + 4, { align: 'center' });
  // Line 2 — gold accent clause.
  setText(doc, GOLD, taglineSize, 'normal', FONT_SERIF);
  doc.text(tagline.accent, cx, centerY + 4 + lineLead, { align: 'center' });

  // ── Matching hairline rule under the tagline + website caption.
  const ruleY = centerY + 4 + lineLead + 16;
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.4);
  doc.line(cx - 14, ruleY, cx + 14, ruleY);
  setText(doc, GOLD, 10, 'normal', FONT_MONO);
  doc.text('futuros.io', cx, ruleY + 8, { align: 'center' });
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

  // Editorial top block: kicker + "Contents" headline. Both kicker and rule
  // use neutral typography — the TOC is a structural index, not an accent
  // (the user's policy is "use colours only for accents"; gold is reserved
  // for brand elements on the cover / back cover).
  let y = MARGIN_TOP + 8;
  kicker(doc, MARGIN_X, y, en ? 'Inside this report' : 'Dentro de este informe', INK_MUTE, 8);
  y += 8;
  setText(doc, INK, 28, 'bold', FONT_SERIF);
  doc.text(en ? 'Contents' : 'Contenidos', MARGIN_X, y + 12);
  y += 18;
  doc.setDrawColor(LINE_STRONG);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  y += 10;

  // Entries — variable-height per entry. Titles and teasers WRAP rather than
  // truncate (the user's policy is "never truncate"). Each entry's row height
  // adapts to fit whatever text wrap produces; if a teaser would need more than
  // 2 lines, we log a console warning and still render all the lines (visual
  // overflow is preferable to silent data loss).
  const pageColW = 22;
  const textColW = CONTENT_W - pageColW - 6;
  const titleX = MARGIN_X + 14;
  const titleMaxW = textColW - 14;
  for (const e of tocEntries) {
    const shifted = e.page + shift;
    // Pre-measure title + teaser to determine row height before drawing.
    setText(doc, INK, 13, 'bold', FONT_SERIF);
    const titleFit = fitTextLines(doc, e.title, titleMaxW, 2);
    if (titleFit.overflow) warnOverflow(`TOC title #${e.num}`, e.title, titleMaxW, 2);
    const titleH = titleFit.lines.length * 6;
    const teaser = teasers[e.num];
    let teaserLines: string[] = [];
    if (teaser) {
      setText(doc, INK_SOFT, 8.5, 'italic', FONT_SERIF);
      const teaserFit = fitTextLines(doc, teaser, titleMaxW, 2);
      teaserLines = teaserFit.lines;
      if (teaserFit.overflow) warnOverflow(`TOC teaser #${e.num}`, teaser, titleMaxW, 2);
    }
    const teaserH = teaserLines.length * 4.4;
    const entryH = Math.max(17, titleH + (teaserH > 0 ? teaserH + 2 : 0) + 4);
    const entryTopY = y - 4;

    // TOC numeral — INK_SOFT (dark grey) so every index number across the
    // report — TOC, page header, 3P opener — uses the same quiet tone.
    setText(doc, INK_SOFT, 16, 'bold', FONT_SERIF);
    doc.text(e.num, MARGIN_X, y + 4);
    // Title — display serif, 13pt, wrapped to fit.
    setText(doc, INK, 13, 'bold', FONT_SERIF);
    let ty = y + 3;
    for (const ln of titleFit.lines) {
      doc.text(ln, titleX, ty);
      ty += 6;
    }
    // Teaser — small italic underneath the title.
    if (teaserLines.length > 0) {
      setText(doc, INK_SOFT, 8.5, 'italic', FONT_SERIF);
      for (const ln of teaserLines) {
        doc.text(ln, titleX, ty);
        ty += 4.4;
      }
    }
    // Page number on the right — vertically centred against the row.
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

/**
 * Wrap {@code text} to at most {@code maxLines} lines that fit {@code maxWidth} at the
 * doc's CURRENT font. Returns the lines and an {@code overflow} flag. NEVER truncates
 * with an ellipsis — the user's explicit policy is "AI may shorten, never truncate".
 * When overflow is detected the caller is expected to log a console warning and either
 * accept the visual overflow (renders all lines) or omit the field entirely.
 */
function fitTextLines(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  maxLines: number,
): { lines: string[]; overflow: boolean } {
  const all = doc.splitTextToSize(text, maxWidth) as string[];
  if (all.length <= maxLines) return { lines: all, overflow: false };
  return { lines: all, overflow: true };
}

/**
 * Log a console warning when text won't fit a layout slot even after AI shortening.
 * Per the user's policy: never silently truncate; log the offender so the next
 * shortening / layout iteration can address it.
 */
function warnOverflow(where: string, text: string, maxWidth: number, maxLines: number) {
  const snippet = text.length > 80 ? text.slice(0, 77) + '…' : text;
  // eslint-disable-next-line no-console
  console.warn(
    `[exportPdf] text overflow at "${where}" (max ${maxLines} line(s) @ ${maxWidth.toFixed(1)}mm): "${snippet}"`,
  );
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
  const en = isEnLang();
  // Set BEFORE addPage so the new page captures the section context for
  // its rotated eyebrow + chip.
  setSection(doc, en ? 'Brief' : 'Resumen', INK_MUTE);
  let y = addPage(doc);
  drawRunningHead(doc);
  const cp = input.companyProfile ?? {};

  // Record both sections in the TOC pointing at this page.
  const briefNum = String(tocEntries.length + 1).padStart(2, '0');
  const page = (doc.getCurrentPageInfo() as { pageNumber: number }).pageNumber;
  tocEntries.push({
    num: briefNum,
    title: en ? 'Brief' : 'Brief',
    page,
    color: INK_MUTE,
  });
  if (exec) {
    const execNum = String(tocEntries.length + 1).padStart(2, '0');
    tocEntries.push({
      num: execNum,
      title: tx('report.results.summary.execTitle', 'Executive summary'),
      page,
      color: INK_MUTE,
    });
  }

  // Layout columns
  const sidebarW = CONTENT_W * 0.32;
  const gap = 8;
  const mainW = CONTENT_W - sidebarW - gap;
  const sidebarX = MARGIN_X;
  const mainX = MARGIN_X + sidebarW + gap;
  const startY = y + 4;
  // Snapshot the starting page. We pin every draw call below to this
  // page so neither column's content can paginate mid-render and shift
  // the doc state out from under the other column. Previously the
  // sidebar's `body()` calls would silently invoke `addPage` whenever
  // `challenge` or `strengths` overflowed, leaving the "02 LEAD"
  // main-column lockup floating on page 2 with no sidebar next to it.
  const firstPage = (doc.getCurrentPageInfo() as { pageNumber: number }).pageNumber;
  // Page-bottom guard for clamped renders. Subtract a small margin so
  // the last drawn line doesn't kiss the footer rule.
  // Leave 14mm padding between the lowest line of body content and the page-footer
  // chrome so the brief's 2-col body never visually crowds the FUTUROS wordmark and
  // page-number chip. Previously this was only 6mm and the right column would render
  // a line that visually kissed the footer rule.
  const clampMaxY = PAGE_BOTTOM - 14;

  // ── 01 + 02 lockups drawn FIRST ──────────────────────────────────
  // Render both column header lockups before any body content. That
  // way the "01 BRIEF" and "02 LEAD" anchors are guaranteed to land on
  // the same page side by side, regardless of how much body content
  // each column ends up holding.
  //
  // Section numbers (briefNum / execNum) and structural rules render in INK /
  // LINE_STRONG — consistent with every other section number and rule in the
  // report. Gold is reserved for brand chrome (cover / back cover / footer
  // wordmark).
  setText(doc, INK_SOFT, 22, 'bold', FONT_SERIF);
  doc.text(briefNum, sidebarX, startY + 4);
  setText(doc, INK_MUTE, 7, 'bold', FONT_MONO);
  doc.text((en ? 'Brief' : 'Brief').toUpperCase(), sidebarX, startY + 11);
  // Short structural rule under "01 BRIEF"
  doc.setDrawColor(LINE_STRONG);
  doc.setLineWidth(0.4);
  doc.line(sidebarX, startY + 22, sidebarX + 14, startY + 22);

  let my = startY;
  if (exec) {
    const execNum = String(tocEntries.length).padStart(2, '0');
    setText(doc, INK_SOFT, 22, 'bold', FONT_SERIF);
    doc.text(execNum, mainX, my + 4);
    setText(doc, INK_MUTE, 7, 'bold', FONT_MONO);
    doc.text((en ? 'Lead' : 'Líder').toUpperCase(), mainX, my + 11);
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
    doc.setDrawColor(LINE_STRONG);
    doc.setLineWidth(0.6);
    doc.line(mainX, my, mainX + 22, my);
    my += 8;
  }

  // ── 01 sidebar body — clamped to the current page ───────────────
  let sy = startY + 30;
  const sidebarRow = (label: string, value: string | undefined) => {
    if (!value) return;
    if (sy + 9 > clampMaxY) return;
    setText(doc, INK_MUTE, 6.8, 'bold', FONT_MONO);
    doc.text(label.toUpperCase(), sidebarX, sy);
    sy += 4;
    setText(doc, INK, 11, 'bold', FONT_SERIF);
    const lines = doc.splitTextToSize(value, sidebarW) as string[];
    for (const ln of lines) {
      if (sy + 5.4 > clampMaxY) break;
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
  if (cp.challenge) {
    if (sy + 8 <= clampMaxY) {
      setText(doc, INK_MUTE, 6.8, 'bold', FONT_MONO);
      doc.text((en ? 'Challenge' : 'Reto').toUpperCase(), sidebarX, sy);
      sy += 4;
      sy = bodyClamped(doc, sy, cp.challenge, {
        indent: sidebarX,
        maxWidth: sidebarW,
        maxY: clampMaxY,
        color: INK_SOFT,
        size: 9.5,
        leading: 5,
        trailingGap: 4,
      });
    }
  }
  if (cp.strengths) {
    if (sy + 8 <= clampMaxY) {
      setText(doc, INK_MUTE, 6.8, 'bold', FONT_MONO);
      doc.text((en ? 'Strengths' : 'Capacidades').toUpperCase(), sidebarX, sy);
      sy += 4;
      sy = bodyClamped(doc, sy, cp.strengths, {
        indent: sidebarX,
        maxWidth: sidebarW,
        maxY: clampMaxY,
        color: INK_SOFT,
        size: 9.5,
        leading: 5,
        trailingGap: 4,
      });
    }
  }
  if ((cp.consultantName || cp.consultantCompany) && sy + 10 <= clampMaxY) {
    const consultant = [cp.consultantName, cp.consultantCompany].filter(Boolean).join(' — ');
    setText(doc, INK_MUTE, 6.8, 'bold', FONT_MONO);
    doc.text((en ? 'Consultant' : 'Consultor').toUpperCase(), sidebarX, sy);
    sy += 4;
    setText(doc, INK_SOFT, 10, 'italic', FONT_SERIF);
    const lines = doc.splitTextToSize(consultant, sidebarW) as string[];
    for (const ln of lines) {
      if (sy + 5.2 > clampMaxY) break;
      doc.text(ln, sidebarX, sy);
      sy += 5.2;
    }
  }

  // Vertical hairline between the columns — pinned to the same page
  // as the lockups, regardless of how short or tall the sidebar ended
  // up being.
  doc.setDrawColor(LINE_STRONG);
  doc.setLineWidth(0.2);
  const divX = mainX - gap / 2;
  doc.line(divX, startY, divX, Math.max(sy, startY + 40));

  // ── 02 main body — italic standfirst (first 1-2 sentences) + 2-col body for
  // the rest. The standfirst is sliced from the source's leading sentences
  // rather than the first paragraph — the AI sometimes returns one mega
  // paragraph, in which case using "paragraph 1" as the standfirst meant the
  // whole text became standfirst and overflowed the page. Capping to a sentence
  // boundary keeps the standfirst bounded regardless of AI paragraphing.
  if (exec) {
    doc.setPage(firstPage);
    // Extract the first 1-2 sentences as the standfirst, up to ~220 chars.
    const STANDFIRST_MAX_CHARS = 220;
    const norm = exec.replace(/\s+/g, ' ').trim();
    let standfirstText = norm;
    let bodyText = '';
    // Walk sentences; collect up to STANDFIRST_MAX_CHARS into the standfirst.
    const sentenceMatcher = /[^.!?¡¿]+[.!?]+(?:["'»)]+)?/g;
    const sentences: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = sentenceMatcher.exec(norm)) !== null) sentences.push(m[0].trim());
    if (sentences.length > 0) {
      let sf = '';
      let cut = 0;
      for (let i = 0; i < sentences.length; i++) {
        const next = sf ? `${sf} ${sentences[i]}` : sentences[i];
        if (next.length > STANDFIRST_MAX_CHARS && sf.length > 0) break;
        sf = next;
        cut = norm.indexOf(sentences[i]) + sentences[i].length;
        if (sf.length >= STANDFIRST_MAX_CHARS) break;
      }
      standfirstText = sf;
      bodyText = norm.slice(cut).trim();
    }
    if (standfirstText) {
      my = standfirstClamped(doc, mainX, my, mainW, standfirstText, clampMaxY, {
        size: 12.5,
        color: INK,
        leading: 7,
        where: 'brief standfirst',
      });
      my += 4;
    }
    if (bodyText) {
      my = flowColumns(doc, mainX, my, mainW, bodyText, {
        columns: 2,
        gutter: 6,
        size: 10,
        family: FONT_SERIF,
        leading: 5.4,
        color: INK,
        maxHeight: clampMaxY - my,
      });
    }
    // No sidebar pull quote — it inevitably echoed the first sentence already shown by
    // the italic standfirst in the main column (the same sentence picked by the pull-quote
    // heuristic). Removing the duplicate keeps the page reading as a single editorial
    // composition rather than a stutter.
  }

  return Math.max(sy, my) + 8;
}

/**
 * Standfirst variant that stops drawing when the next line would
 * exceed {@code maxY}. Used by the brief/exec spread to ensure a long
 * first paragraph never paginates the doc out from under a side-by-
 * side layout. Behaves identically to {@link standfirst} on short
 * paragraphs.
 */
function standfirstClamped(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  text: string,
  maxY: number,
  opts: { size?: number; color?: string; leading?: number; where?: string } = {},
): number {
  const size = opts.size ?? 14;
  const leading = opts.leading ?? size * 0.62;
  setText(doc, opts.color ?? INK, size, 'italic', FONT_SERIF);
  const lines = doc.splitTextToSize(text, w) as string[];
  let drawn = 0;
  for (const ln of lines) {
    if (y + leading > maxY) break;
    doc.text(ln, x, y);
    y += leading;
    drawn++;
  }
  if (drawn < lines.length) {
    warnOverflow(opts.where ?? 'standfirstClamped', text, w, drawn);
  }
  return y + 2;
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
 * STEEP context — Global + Sectorial side-by-side, dimension-by-dimension.
 *
 * <p>Each dimension (S / T / E / ENV / P) forms a horizontal band: a
 * coloured letter badge + dimension name across the top, then two
 * columns of body text below — Global on the left, Sectorial on the
 * right. Rows align across the two columns so the same dimension on
 * Global lines up exactly with the same dimension on Sectorial. Drops
 * the previous "stack Global then Sectorial" layout that buried half
 * the data below the fold.
 */
function renderSteepInputs(
  doc: jsPDF,
  yIn: number,
  input: InputData,
  tightened: TightenedMap = {},
): number {
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
    INK_MUTE,
  );

  const en = isEnLang();
  // ── Column headers (Global / Sectorial) above the dimension stack.
  const gutter = 6;
  const colW = (CONTENT_W - gutter) / 2;
  const colLX = MARGIN_X;
  const colRX = MARGIN_X + colW + gutter;
  const drawColHeaders = (yh: number): number => {
    if (!(hasGlobal && hasSect)) return yh;
    // Column-header eyebrows — neutral mono caps. The colour-as-identity
    // happens INSIDE each STEEP band (the letter badge), not on these
    // structural labels.
    setText(doc, INK_MUTE, 8, 'bold', FONT_MONO);
    doc.text(tx('report.results.steep.global', 'Global').toUpperCase(), colLX, yh);
    doc.text(tx('report.results.steep.sectorial', 'Sectorial').toUpperCase(), colRX, yh);
    // Neutral grey rule under the column eyebrows — was LINE_ACCENT which is
    // a yellowish gold tint on the light palette; gold is brand-only.
    doc.setDrawColor(LINE_STRONG);
    doc.setLineWidth(0.4);
    doc.line(colLX, yh + 2.5, MARGIN_X + CONTENT_W, yh + 2.5);
    return yh + 9;
  };
  y = drawColHeaders(y);

  // ── Per-dimension bands — one per page (except S which shares page 1 with the title).
  //
  // Per the user's explicit rule: the first dimension (Social) must sit on the same page
  // as the section title; the remaining four (T, E, ENV, P) each get their own dedicated
  // page. This prevents the "title alone on a page, content on the next" pagination
  // symptom and gives each dimension room to breathe. AI shortening still applies via
  // {@link budgetFor} when source text would overflow the page.
  const twoCol = hasGlobal && hasSect;
  const bandSpacing = 4;
  const filledDims = dims.filter((k) => ((g[k] ?? '').trim() + (s[k] ?? '').trim()).length > 0);
  for (let i = 0; i < filledDims.length; i++) {
    const k = filledDims[i];
    // Force a page break before every dim EXCEPT the first one — the first dim shares the
    // header page so the title doesn't sit alone on page 1.
    if (i > 0) {
      y = addPage(doc);
      drawRunningHead(doc);
      y = drawColHeaders(y + 4);
    }
    const gv = pickText(tightened, `steep.global.${k}`, (g[k] ?? '').trim());
    const sv = pickText(tightened, `steep.sectorial.${k}`, (s[k] ?? '').trim());
    y = renderSteepBand(doc, y, k, gv, sv, {
      colW,
      gutter,
      colLX,
      colRX,
      twoCol,
      en,
      // The first band (Social) must stay on page 1 with the section header per the
      // user's explicit rule; skipping the in-band page break enforces that even when
      // the AI-tightened text is a touch too long for the available space.
      skipPageBreak: i === 0,
    });
    y += bandSpacing;
  }
  return y;
}

/**
 * Pre-measure a STEEP band's total height (header + body) without drawing. Currently
 * unused — STEEP locked to one-dim-per-page so no pre-measurement is needed. Kept
 * around in case a future iteration wants greedy packing back.
 */
function _measureSteepBand(
  doc: jsPDF,
  globalText: string,
  sectorialText: string,
  { twoCol, colW }: { twoCol: boolean; colW: number },
): number {
  const headerH = 9;
  const bodySize = 9.5;
  const bodyLead = 4.8;
  const bodyMaxW = twoCol ? colW : CONTENT_W;
  const measure = (text: string) =>
    text
      ? measureBody(doc, text, {
          size: bodySize,
          family: FONT_SANS,
          maxWidth: bodyMaxW,
          leading: bodyLead,
        })
      : 0;
  const gH = measure(globalText);
  const sH = measure(sectorialText);
  return headerH + Math.max(gH, sH) + 4;
}
void _measureSteepBand;

/**
 * One STEEP dimension as a side-by-side band. Header row shows the
 * coloured letter badge + dimension name spanning both columns (so the
 * same "S" anchors both Global and Sectorial), and the body splits into
 * two columns below — Global on the left, Sectorial on the right. When
 * only one side has content, the body renders as a single full-width
 * column so we don't leave half the band visually empty.
 */
function renderSteepBand(
  doc: jsPDF,
  yIn: number,
  k: 'S' | 'T' | 'E' | 'ENV' | 'P',
  globalText: string,
  sectorialText: string,
  layout: {
    colW: number;
    gutter: number;
    colLX: number;
    colRX: number;
    twoCol: boolean;
    en: boolean;
    /** When true, skip the in-band {@link checkY} call so the band always lands on the
     *  current page even when content overflows. Used for Social (the first band)
     *  which shares page 1 with the section title — the user's policy is "Social must
     *  stay on this page; if too long, AI must shorten further". A console warning
     *  fires when overflow happens so future iteration can address the offender. */
    skipPageBreak?: boolean;
  },
): number {
  const { fg, bg } = steepColor(k);
  const { colW, colLX, colRX, twoCol } = layout;
  const headerH = 9;
  // Body is always 9.5pt sans with tight 4.8 leading so 5 bands have a
  // shot at fitting on one page even with verbose entries.
  const bodySize = 9.5;
  const bodyLead = 4.8;
  const bodyMaxW = twoCol ? colW : CONTENT_W;

  // Pre-measure each side; band height is the max of the two so the
  // bottom rule sits cleanly across.
  const measure = (text: string) =>
    text
      ? measureBody(doc, text, {
          size: bodySize,
          family: FONT_SANS,
          maxWidth: bodyMaxW,
          leading: bodyLead,
        })
      : 0;
  const gH = measure(globalText);
  const sH = measure(sectorialText);
  const bodyH = Math.max(gH, sH);
  const bandH = headerH + bodyH + 4;

  let y: number;
  if (layout.skipPageBreak) {
    // Hard-pin the band to the current page (Social policy — see option above).
    if (yIn + bandH + 2 > PAGE_BOTTOM) {
      warnOverflow(`STEEP band ${k} (pinned)`, `${globalText} | ${sectorialText}`, bodyMaxW, 0);
    }
    y = yIn;
  } else {
    y = checkY(doc, yIn, bandH + 2);
  }

  // ── Header row: letter badge + dimension name + thin colored rule
  doc.setFillColor(bg);
  doc.roundedRect(MARGIN_X, y - 4, 9, 9, 1.6, 1.6, 'F');
  setText(doc, fg, 8.5, 'bold', FONT_MONO);
  const lw = doc.getTextWidth(k);
  doc.text(k, MARGIN_X + 4.5 - lw / 2, y + 1.8);
  setText(doc, INK, 11.5, 'bold', FONT_SANS);
  doc.text(steepLabel(k), MARGIN_X + 13, y + 1.5);
  doc.setDrawColor(fg);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_X, y + 6, MARGIN_X + CONTENT_W, y + 6);

  // ── Body row
  const bodyY = y + headerH + 2;
  if (twoCol) {
    // Two columns: Global on left, Sectorial on right. Both start at the same y
    // so the same dimension band aligns horizontally. CRITICAL: noPaginate must
    // be true — body()'s default per-line checkY would addPage mid-render for
    // the LEFT column if global text is long, leaving the RIGHT column to draw
    // at the original bodyY on the NEW page (visually stacking the columns
    // across two pages instead of keeping them side-by-side).
    if (globalText) {
      body(doc, bodyY, globalText, {
        indent: colLX,
        maxWidth: colW,
        color: INK_SOFT,
        size: bodySize,
        family: FONT_SANS,
        leading: bodyLead,
        paragraphGap: 2,
        trailingGap: 0,
        noPaginate: true,
      });
    } else {
      setText(doc, INK_FAINT, 8, 'italic', FONT_SANS);
      doc.text('—', colLX, bodyY);
    }
    if (sectorialText) {
      body(doc, bodyY, sectorialText, {
        indent: colRX,
        maxWidth: colW,
        color: INK_SOFT,
        size: bodySize,
        family: FONT_SANS,
        leading: bodyLead,
        paragraphGap: 2,
        trailingGap: 0,
        noPaginate: true,
      });
    } else {
      setText(doc, INK_FAINT, 8, 'italic', FONT_SANS);
      doc.text('—', colRX, bodyY);
    }
    // Faint vertical divider between the two columns inside the band.
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.15);
    const midX = (colLX + colW + colRX) / 2;
    doc.line(midX, bodyY - 1, midX, bodyY + bodyH - 2);
  } else {
    const text = globalText || sectorialText;
    body(doc, bodyY, text, {
      indent: MARGIN_X,
      maxWidth: CONTENT_W,
      color: INK_SOFT,
      size: bodySize,
      family: FONT_SANS,
      leading: bodyLead,
      paragraphGap: 2,
      trailingGap: 0,
    });
  }

  return y + bandH;
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
    INK_MUTE,
  );
  const gap = 6;
  const colW = (CONTENT_W - gap) / 2;
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    const heights = pair.map((u, j) => measureUncertaintyCard(doc, u, colW, i + j));
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

function measureUncertaintyCard(doc: jsPDF, u: KeyUncertainty, w: number, idx: number): number {
  const titleW = w - 12;
  setText(doc, INK, 11.5, 'bold', FONT_SERIF);
  const titleLines = doc.splitTextToSize(u.name, titleW) as string[];
  const titleH = titleLines.length * 5.6;
  const desc = T(`keyUncertainties.${idx}.description`, u.description);
  const descH = desc
    ? measureBody(doc, desc, { size: 9, family: FONT_SANS, maxWidth: titleW, leading: 4.7 })
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
  // Compact INK_SOFT numeral — every subsection number across the report uses
  // INK_SOFT (uncertainties index, TOC, page-header, 3P opener — all match).
  setText(doc, INK_SOFT, 22, 'bold', FONT_SERIF);
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
  const desc = T(`keyUncertainties.${idx}.description`, u.description);
  if (desc) {
    body(doc, ty, desc, {
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
  // Dedicated section opener page — the user explicitly asked for the section title
  // to be visible (it was previously suppressed). A clean opener page introduces all
  // three scenarios at once, then each scenario gets its own feature spread.
  setSection(doc, tx('report.results.tabs.scenarios', '3P Scenarios'), GREEN);
  let y = addPage(doc);
  drawRunningHead(doc);
  y = pageHeader(
    doc,
    y,
    tx('report.results.tabs.scenarios', '3P Scenarios'),
    isEnLang() ? 'Futures' : 'Futuros',
    GREEN,
  );
  // Standfirst describing the 3P frame.
  y = standfirst(
    doc,
    MARGIN_X,
    y,
    CONTENT_W,
    isEnLang()
      ? 'Three scenarios that frame the strategic landscape: the most probable trajectory, a plausible alternative, and a low-probability disruption.'
      : 'Tres escenarios que enmarcan el panorama estratégico: la trayectoria más probable, una alternativa plausible y una disrupción de baja probabilidad.',
    { size: 12, color: INK, leading: 6.6 },
  );
  y += 4;
  // Quick index card — list each scenario type + name + probability so the opener
  // works as a section "table of contents". Numerals + type label + name stay
  // neutral / typographic; the probability number alone carries the scenario's
  // identity colour so each row has a single editorial accent.
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    const colors = scenarioColors(s.type, i);
    // Pre-measure the probability block so we can size the name's available width
    // to avoid overlap. The probability is rendered larger than the name, so we
    // leave generous breathing room (8mm gap).
    const probSize = 18;
    setText(doc, colors.fg, probSize, 'bold', FONT_SERIF);
    const probW = s.probability ? doc.getTextWidth(s.probability) : 0;
    // Name column starts after the numeral and pill, extends until the probability
    // block (or right margin when there is no probability).
    const nameX = MARGIN_X + 22;
    const nameRightLimit = PAGE_W - MARGIN_X - (probW > 0 ? probW + 8 : 0);
    const nameW = Math.max(40, nameRightLimit - nameX);
    const rawName = (s.name ?? s.title ?? '').trim();
    // Auto-shrink the name's font size so it always fits on at most 2 lines
    // without truncation. We start at 14pt and step down to a 10pt floor; if
    // the name still needs more than 2 lines at 10pt we log a warning and
    // render all the lines (visual overflow > silent truncation).
    let nameSize = 14;
    let nameLines: string[] = [];
    for (;;) {
      setText(doc, INK, nameSize, 'bold', FONT_SERIF);
      nameLines = doc.splitTextToSize(rawName, nameW) as string[];
      if (nameLines.length <= 2 || nameSize <= 10) break;
      nameSize -= 1;
    }
    if (nameLines.length > 2) {
      warnOverflow(`scenario opener name #${i + 1}`, rawName, nameW, 2);
    }
    const lineLead = nameSize * 0.4;
    const rowH = Math.max(16, 11 + (nameLines.length - 1) * lineLead);
    y = checkY(doc, y, rowH + 6);
    // INK_SOFT numeral — matches the section-number colour used in the TOC
    // and pageHeader. All section / subsection numbers across the report
    // share this dark-grey tone.
    setText(doc, INK_SOFT, 28, 'bold', FONT_SERIF);
    const numStr = String(i + 1).padStart(2, '0');
    doc.text(numStr, MARGIN_X, y + 9);
    // Type label — small uppercase mono caption (neutral) above the name.
    if (s.type) {
      setText(doc, INK_MUTE, 7.5, 'bold', FONT_MONO);
      doc.text(s.type.toUpperCase(), nameX, y + 5);
    }
    // Name — rendered at the shrunken size so it always fits without truncation.
    setText(doc, INK, nameSize, 'bold', FONT_SERIF);
    let ny = y + 11;
    for (const ln of nameLines) {
      doc.text(ln, nameX, ny);
      ny += lineLead;
    }
    // Probability — scenario's identity colour. The single coloured element in
    // the row, working as the row's editorial accent.
    if (s.probability) {
      setText(doc, colors.fg, probSize, 'bold', FONT_SERIF);
      doc.text(
        s.probability,
        PAGE_W - MARGIN_X - probW,
        y + 9 + (nameLines.length > 1 ? 3 : 0),
      );
    }
    // Advance past the row WITH descender padding so the divider below never
    // clips through 'p' / 'g' / 'q' descenders of the last name line.
    y += rowH + 3;
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
    y += 4;
  }

  // Per-scenario feature spreads
  for (let i = 0; i < scenarios.length; i++) {
    // Per-scenario section: rotated eyebrow shows the scenario type
    // ("Probable" / "Plausible" / "Posible") on every page of that
    // scenario, coloured to match.
    const s = scenarios[i];
    const colors = scenarioColors(s.type, i);
    const label = (s.type ?? `Scenario ${i + 1}`).trim() || `Scenario ${i + 1}`;
    setSection(doc, label, colors.fg);
    y = addPage(doc);
    drawRunningHead(doc);
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
  // Use the tightened description when available so the standfirst +
  // body fits the scenario page even before the actions grid below.
  const descParts = T(`scenarios.${idx}.description`, s.description).trim();
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
    // Success factors use BLUE — gold is reserved for brand chrome only.
    [s.successFactors, tx('report.results.scen.success', 'Success factors'), BLUE],
  ];
  const cols = lists.filter(([items]) => (items?.length ?? 0) > 0);
  if (cols.length > 0) {
    const colGap = 5;
    const colW = (CONTENT_W - colGap * (cols.length - 1)) / cols.length;
    const colItemSize = 8.5;
    const colItemLeading = 4.4;
    // Measure each column's height for the side-by-side layout. CRITICAL: setText to
    // the bullet font BEFORE splitTextToSize — jsPDF measures wrap width against the
    // CURRENT font, so calling splitTextToSize while the doc still has (say) the 10pt
    // serif body font active would massively overestimate line counts and trigger a
    // false "doesn't fit, addPage()" elsewhere. Without this the action grid was
    // landing on a fresh page even when 100mm+ of room remained.
    const colHeights = cols.map(([items]) => {
      setText(doc, INK_SOFT, colItemSize, 'normal', FONT_SANS);
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
  // Smart layout: if the first-move fits the remaining space on the
  // current scenario page, render the compact gold-stripe box inline.
  // If it doesn't fit (would land on a near-empty fresh page), promote
  // it to a full-page hero centerpiece — bigger, centered, ornamented —
  // so the reader sees an intentional "conclusion" page rather than a
  // lonely box floating at the top of a mostly-empty page.
  if (s.firstMove) {
    const fm = T(`scenarios.${idx}.firstMove`, s.firstMove);
    // Layout choice is fixed upstream for ALL three scenarios — either every scenario
    // uses the compact inline box (option 1: 1 page per scenario) or every scenario
    // uses the centred hero page (option 2: 2 pages per scenario, firstMove standalone).
    if (layoutChoices.scenarios === 'compact') {
      const innerW = CONTENT_W - 14;
      const compactH =
        measureBody(doc, fm, {
          size: 10.5,
          family: FONT_SANS,
          maxWidth: innerW,
          leading: 5.5,
        }) + 12;
      y += 1;
      card(doc, MARGIN_X, y, CONTENT_W, compactH, {
        fill: SURFACE_2,
        border: LINE_ACCENT,
        // Stripe + label use the SCENARIO's accent (not the brand gold) so
        // every visual element on the scenario page reads as part of the
        // same colour family.
        stripe: colors.fg,
      });
      setText(doc, colors.fg, 7, 'bold', FONT_MONO);
      doc.text(
        tx('report.results.scen.firstmove', 'First move').toUpperCase(),
        MARGIN_X + 7,
        y + 5.5,
      );
      body(doc, y + 10.5, fm, {
        indent: MARGIN_X + 7,
        maxWidth: innerW,
        color: INK,
        size: 10.5,
        family: FONT_SANS,
        leading: 5.5,
        trailingGap: 0,
      });
      y += compactH + 3;
    } else {
      y = renderFirstMoveHero(doc, fm, colors, en, s);
    }
  }

  return y;
}

/**
 * Full-page "First Move" hero. Used when the firstMove text won't fit
 * inline on the scenario page and would otherwise float at the top of
 * a near-empty page. Centers the text vertically with decorative rules,
 * splits a leading short phrase (e.g. "Within 30 days,") as the display
 * line if one exists, and renders the rest as a centered serif body.
 *
 * <p>Reads like the closing spread of a magazine feature — TIME's
 * "What can I do?" call-to-action page pattern.
 */
function renderFirstMoveHero(
  doc: jsPDF,
  text: string,
  colors: { fg: string; bg: string },
  _en: boolean,
  s: Scenario,
): number {
  // Fresh page so the hero owns the spread. drawRunningHead keeps the
  // FUTUROS strip + section eyebrow consistent with the rest of the
  // scenario's pages.
  addPage(doc);
  drawRunningHead(doc);

  // ── Extract a TIMEFRAME headline. The user wants a clear timeframe rendered LARGE and
  // BOLD at the top of every firstMove hero page — so we ALWAYS produce a headline, falling
  // back to a sensible default ("Inmediato" / "Now") when the source text doesn't surface
  // an explicit temporal anchor.
  //
  // Strategy:
  //   1. Try the leading clause before a comma/em-dash if it reads like a temporal phrase.
  //   2. Otherwise scan the first sentence for a temporal pattern anywhere inside it
  //      (e.g. "...en los próximos 30 días...", "...within the next quarter...").
  //   3. If neither yields a headline, use the locale default.
  const { head, bodyText } = extractTimeframeHeadline(text, _en);

  // ── Top-of-page block (no centring). The user wanted the timeframe LARGE and BOLD at
  // the top — so we anchor at the top margin and grow downward, instead of vertically
  // centring the whole composition like before.
  const topMargin = MARGIN_TOP + 6;
  let cy = topMargin;

  // ── Tiny kicker above the headline so the page is still labelled as "FIRST MOVE".
  // Neutral mute mono — the page's scenario identity already comes through via the
  // rotated section eyebrow on the left margin and the timeframe headline below,
  // so this top-row kicker stays quiet and typographic.
  setText(doc, INK_MUTE, 8, 'bold', FONT_MONO);
  doc.text(
    tx('report.results.scen.firstmove', 'First move').toUpperCase(),
    MARGIN_X,
    cy + 3,
  );
  // Scenario type · name on the right of the kicker row.
  setText(doc, INK_MUTE, 7, 'bold', FONT_MONO);
  const meta = `${(s.type ?? '').toUpperCase()}${s.name ? ' · ' + s.name.toUpperCase() : ''}`;
  const metaW = doc.getTextWidth(meta);
  doc.text(meta, PAGE_W - MARGIN_X - metaW, cy + 3);
  cy += 8;

  // Thin neutral rule under the kicker — matches the rest of the report's
  // structural rules (no scenario tint on this divider).
  doc.setDrawColor(LINE_STRONG);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, cy, PAGE_W - MARGIN_X, cy);
  cy += 4;

  // ── HEADLINE (timeframe) — LARGE and BOLD at the top of the page.
  // Auto-shrinks so the timeframe always fits on at most two lines without
  // breaking the layout. We aim big (52pt) and step down by 4pt until the
  // headline fits within two lines or hits a floor of 32pt.
  let headSize = 52;
  let headLines: string[] = [];
  for (;;) {
    setText(doc, colors.fg, headSize, 'bold', FONT_SERIF);
    headLines = doc.splitTextToSize(head, CONTENT_W) as string[];
    if (headLines.length <= 2 || headSize <= 32) break;
    headSize -= 4;
  }
  setText(doc, colors.fg, headSize, 'bold', FONT_SERIF);
  for (const ln of headLines) {
    cy += headSize * 0.4;
    doc.text(ln, MARGIN_X, cy);
    cy += headSize * 0.2;
  }
  cy += 6;

  // ── Body text — italic serif, generous size. Left-aligned (not centred) so it
  // reads as a deliberate editorial column under the big headline.
  const bodySize = 14;
  const bodyMaxW = CONTENT_W * 0.86;
  setText(doc, INK, bodySize, 'italic', FONT_SERIF);
  const bodyLines = doc.splitTextToSize(bodyText, bodyMaxW) as string[];
  for (const ln of bodyLines) {
    cy += bodySize * 0.45;
    doc.text(ln, MARGIN_X, cy);
    cy += bodySize * 0.25;
  }

  // No bottom decoration — user explicitly asked for the rule + diamond to be removed
  // so the body flows freely toward the page footer without a hard visual stop.
  return cy + 8;
}

/**
 * Extract a clear timeframe from a "first move" text and return it as the page's
 * display headline alongside the remaining body. Always returns a non-null head —
 * falls back to a locale-specific default ("Inmediato" / "Now") when no temporal
 * anchor is found.
 *
 * <p>Recognised patterns (case-insensitive, ES + EN):
 *   • Leading clauses before a comma/em-dash that look temporal
 *     ("Within 30 days,", "En los próximos 90 días,").
 *   • Inline phrases anywhere in the first sentence that combine a quantifier
 *     ("dentro de", "en los próximos", "within", "in the next") with a time unit
 *     ("días", "semanas", "meses", "años", "days", "weeks", "months", "years").
 *   • Bare quarter / year markers ("Q1 2026", "Year 1", "Año 1").
 *   • Standalone temporal nouns ("Inmediato", "Now", "Primer trimestre").
 */
function extractTimeframeHeadline(
  text: string,
  en: boolean,
): { head: string; bodyText: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { head: en ? 'Now' : 'Inmediato', bodyText: '' };
  }

  // 1) Leading clause split — "Within 30 days, …" / "En los próximos 90 días, …".
  const commaIdx = trimmed.search(/[,—–]/);
  if (commaIdx >= 4 && commaIdx <= 60) {
    const candidate = trimmed.slice(0, commaIdx).trim();
    if (looksTemporal(candidate)) {
      const rest = trimmed.slice(commaIdx + 1).trim();
      return {
        head: prettyTimeframe(candidate),
        bodyText: rest.charAt(0).toUpperCase() + rest.slice(1),
      };
    }
  }

  // 2) Inline temporal phrase anywhere in the first ~200 chars. Match a quantifier
  //    followed by a number-and-unit run, e.g. "en los próximos 30 días", "within the
  //    next 6 months".
  const window = trimmed.slice(0, 240);
  const inlinePatterns: RegExp[] = [
    // Spanish quantified
    /\b(?:en\s+los\s+próximos|en\s+las\s+próximas|durante\s+los\s+próximos|durante\s+las\s+próximas|dentro\s+de|en)\s+(\d+|tres|cuatro|cinco|seis|nueve|doce|primer|primeros|primera|primeras)\s+(días?|semanas?|meses|años?|trimestres?|horas?)/i,
    // English quantified
    /\b(?:within\s+(?:the\s+next\s+)?|in\s+the\s+next|in\s+the\s+first|over\s+the\s+next|during\s+the\s+first)\s+(\d+|three|four|five|six|nine|twelve|first)?\s*(days?|weeks?|months?|years?|quarters?|hours?)/i,
    // Quarter / year markers
    /\b(Q[1-4](?:\s+\d{4})?)\b/i,
    /\b(Year\s+\d+|Año\s+\d+)\b/i,
    // Bare temporal anchors
    /\b(Primer\s+trimestre|Primera\s+semana|Primer\s+mes|First\s+quarter|First\s+week|First\s+month)\b/i,
    /\b(Inmediato|Inmediatamente|Ahora|Now|Immediately)\b/i,
  ];
  for (const re of inlinePatterns) {
    const m = window.match(re);
    if (m) {
      return { head: prettyTimeframe(m[0]), bodyText: trimmed };
    }
  }

  // 3) Locale fallback. "Primer paso" / "First step" reads as a clear opener even
  //    when no explicit timeframe is in the source text.
  return {
    head: en ? 'First step' : 'Primer paso',
    bodyText: trimmed,
  };
}

/** Title-case a timeframe phrase so it reads as an editorial headline. */
function prettyTimeframe(s: string): string {
  const cleaned = s.trim().replace(/\s+/g, ' ').replace(/[.,;:]+$/, '');
  // Capitalise the first letter of each word; keep accented chars intact.
  return cleaned
    .split(' ')
    .map((w) => (w.length > 0 ? w.charAt(0).toLocaleUpperCase() + w.slice(1).toLocaleLowerCase() : w))
    .join(' ');
}

/** Quick heuristic: does this clause look like a temporal anchor? */
function looksTemporal(s: string): boolean {
  return /\b(\d+|first|primer|primera|within|dentro|durante|próximos|próximas|next|en\s+los|en\s+las|day|days|días?|week|weeks|semanas?|month|months|meses?|year|years|años?|hour|hours|horas?|q[1-4]|trimestre|quarter|inmediato|inmediatamente|ahora|now|immediately)\b/i.test(
    s,
  );
}

/* ── Section: Scenario Planning ───────────────────────────────────── */

/**
 * Scenario Planning — compact magazine "structure" feature. Opens
 * with an italic standfirst, then a 2×2 grid of driving forces, then
 * a featured 2-column axes spread, then 3 narrow scenario-logic
 * cards in a row. Everything keyed to fit on roughly 1-2 pages.
 */
function renderScenarioPlanning(doc: jsPDF, sp: ScenarioPlanning): number {
  setSection(doc, isEnLang() ? 'Scenario Planning' : 'Planificación', BLUE);
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
    y = standfirst(doc, MARGIN_X, y, CONTENT_W, T('scenarioPlanning.intro', sp.intro), {
      size: 11.5,
      color: INK,
      leading: 6.4,
    });
    y += 4;
  }

  // ── Driving forces — simple pagination using the unified planning-row layout.
  // Pre-measure each force's row height; when the next row doesn't fit on the
  // current page, addPage() and continue. No more hero feature pages — every
  // force renders at the same compact style as axes + logics for consistency.
  if (sp.drivingForces?.length) {
    const forces = [...sp.drivingForces].sort((a, b) => a.rank - b.rank);
    y = sectionLabel(doc, y, tx('report.results.sp.forces', 'Driving forces of change'), INK_MUTE, 26);
    for (let i = 0; i < forces.length; i++) {
      const h = measureDrivingForceRowH(doc, forces[i], i);
      if (y + h + 4 > PAGE_BOTTOM) {
        y = addPage(doc);
        drawRunningHead(doc);
      }
      y = renderDrivingForceRow(doc, y, forces[i], i);
      // Divider between forces (skip after the last).
      if (i < forces.length - 1) {
        doc.setDrawColor(LINE);
        doc.setLineWidth(0.2);
        doc.line(MARGIN_X, y + 1, PAGE_W - MARGIN_X, y + 1);
        y += 2;
      }
    }
    y += 4;
  }

  // ── Axes — full-width stacked spread ─────────────────────────
  //
  // EJES DE INCERTIDUMBRE CRÍTICA ALWAYS starts on a fresh page (user policy).
  // The section label otherwise lands wherever driving-forces happened to end,
  // which can put the "Critical uncertainty axes" headline near the bottom of a
  // page with only a sliver of room for the first axis row.
  //
  // Each axis renders as a full-width row with the JUSTIFICATION explicitly broken
  // out from the spectrum (label + poles) so the "why" reads as its own deliberate
  // block — not crammed at the bottom of a tight card. Text sizes are bumped from
  // the old card design (9pt → 11pt for poles, 8.5pt → 10pt for rationale) to make
  // better use of the page.
  if (sp.axes?.length) {
    y = addPage(doc);
    drawRunningHead(doc);
    const firstAxisH = measureAxisRow(doc, sp.axes[0], 0);
    y = sectionLabel(
      doc,
      y,
      tx('report.results.sp.axesTitle', 'Critical uncertainty axes'),
      INK_MUTE,
      firstAxisH + 4,
    );
    for (let i = 0; i < sp.axes.length; i++) {
      const h = measureAxisRow(doc, sp.axes[i], i);
      y = checkY(doc, y, h + 6);
      y = renderAxisRow(doc, y, sp.axes[i], i);
      // Divider between axes (skip after the last one).
      if (i < sp.axes.length - 1) {
        doc.setDrawColor(LINE);
        doc.setLineWidth(0.2);
        doc.line(MARGIN_X, y + 1, PAGE_W - MARGIN_X, y + 1);
        y += 5;
      }
    }
    y += 4;
  }

  // ── Scenario logics — same unified row layout, paginated when needed.
  if (sp.scenarioLogics?.length) {
    // Always start the narrative-logic block on its own fresh page so the
    // section label never sits at the bottom of a page packed with driving
    // forces or axis rows.
    y = addPage(doc);
    drawRunningHead(doc);
    y = sectionLabel(
      doc,
      y,
      tx('report.results.sp.logics', 'Narrative logic per scenario'),
      INK_MUTE,
      24,
    );
    for (let i = 0; i < sp.scenarioLogics.length; i++) {
      const h = measureScenarioLogicRowH(doc, sp.scenarioLogics[i], i);
      if (y + h + 4 > PAGE_BOTTOM) {
        y = addPage(doc);
        drawRunningHead(doc);
      }
      y = renderScenarioLogicRow(doc, y, sp.scenarioLogics[i], i);
      if (i < sp.scenarioLogics.length - 1) {
        doc.setDrawColor(LINE);
        doc.setLineWidth(0.2);
        doc.line(MARGIN_X, y + 1, PAGE_W - MARGIN_X, y + 1);
        y += 2;
      }
    }
  }
  return y;
}

/** Pre-measure a scenario-logic row using the unified planning-row geometry. */
function measureScenarioLogicRowH(doc: jsPDF, l: ScenarioLogic, idx: number): number {
  setText(doc, INK, 16, 'bold', FONT_SERIF);
  const labelLines = doc.splitTextToSize(l.name, CONTENT_W - 12) as string[];
  const headingH = 6 + labelLines.length * 6.4 + 5 + 3.5;
  const logic = T(`scenarioPlanning.scenarioLogics.${idx}.logic`, l.logic);
  const bodyH = logic
    ? measureBody(doc, logic, { size: 10, family: FONT_SANS, maxWidth: CONTENT_W - 12, leading: 5.2 })
    : 0;
  return headingH + bodyH + 1;
}

// Kept for potential future lookahead pagination (scenario logics now
// always start on a fresh page, so this measure isn't currently used).
function _measureScenarioLogicRow(doc: jsPDF, l: ScenarioLogic): number {
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
  const logic = T(`scenarioPlanning.scenarioLogics.${idx}.logic`, l.logic);
  return renderPlanningRow(doc, yIn, {
    eyebrowNum: String(idx + 1).padStart(2, '0'),
    label: l.name,
    body: logic,
  });
}

/**
 * Shared Scenario-Planning row layout. Every subsection of the planning section
 * (Driving Forces, Critical Axes, Narrative Logic) renders one or more of these
 * rows so the chapter reads as a single composition rather than three different
 * card styles glued together.
 *
 * Anatomy:
 *   ┌─ MARGIN_X ───────────────────────────────────────────────────┐
 *   │ NN   Big Serif Label                       [ optional stat ] │
 *   │      ─── gold rule ────                                      │
 *   │      [body content — text and/or custom drawn below]         │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * The {@code drawBody} callback is invoked AFTER the heading + rule are drawn,
 * letting callers draw multi-block bodies (like the axis poles row) while the
 * heading still matches the others. Returns the y after the body.
 */
function renderPlanningRow(
  doc: jsPDF,
  yIn: number,
  opts: {
    eyebrowNum: string;
    label: string;
    rightStat?: string;
    rightStatLabel?: string;
    body?: string | null;
    drawBody?: (y: number) => number;
  },
): number {
  let y = yIn;
  const numX = MARGIN_X;
  const labelX = MARGIN_X + 12;
  // Reserve space on the right for the stat (when present).
  let labelMaxW = CONTENT_W - 12;
  let statW = 0;
  if (opts.rightStat) {
    setText(doc, INK, 18, 'bold', FONT_SERIF);
    statW = doc.getTextWidth(opts.rightStat) + 4;
    labelMaxW -= statW;
  }
  // ── Eyebrow numeral — neutral mute mono so every subsection number across
  // the report matches (per user policy: section numbers are always neutral).
  setText(doc, INK_MUTE, 9, 'bold', FONT_MONO);
  doc.text(opts.eyebrowNum, numX, y + 4);
  // ── Label (large serif headline). Tighter leading (6.4 vs 7.2) so multi-line
  // labels don't bloat the heading band — helps pack 3 logic rows per page.
  setText(doc, INK, 16, 'bold', FONT_SERIF);
  const labelLines = doc.splitTextToSize(opts.label, labelMaxW) as string[];
  const labelLead = 6.4;
  let ty = y + 6;
  for (const ln of labelLines) {
    doc.text(ln, labelX, ty);
    ty += labelLead;
  }
  // ── Right-side stat (e.g. impact score for driving forces). Rendered in INK
  // (bold serif) — emphasis comes from size and weight, not colour, in line
  // with the "colours only for accents" policy.
  if (opts.rightStat) {
    setText(doc, INK, 18, 'bold', FONT_SERIF);
    const sw = doc.getTextWidth(opts.rightStat);
    doc.text(opts.rightStat, PAGE_W - MARGIN_X - sw, y + 7);
    if (opts.rightStatLabel) {
      setText(doc, INK_MUTE, 6.5, 'bold', FONT_MONO);
      const lw = doc.getTextWidth(opts.rightStatLabel.toUpperCase());
      doc.text(opts.rightStatLabel.toUpperCase(), PAGE_W - MARGIN_X - lw, y + 12);
    }
  }
  y = ty - labelLead + 5; // collapse the trailing gap below the last label line

  // ── Thin structural rule under the label — neutral grey, not the brand gold.
  doc.setDrawColor(LINE_STRONG);
  doc.setLineWidth(0.35);
  doc.line(labelX, y, labelX + 16, y);
  y += 3.5;

  // ── Body — either a custom drawing callback OR a simple text block.
  if (opts.drawBody) {
    y = opts.drawBody(y);
  } else if (opts.body) {
    y = body(doc, y, opts.body, {
      indent: labelX,
      maxWidth: CONTENT_W - 12,
      size: 10,
      color: INK_SOFT,
      family: FONT_SANS,
      leading: 5.2,
      trailingGap: 0,
    });
  }
  return y + 1;
}

/**
 * Pre-compute the height a compact driving-force row will occupy, so
 * the smart pagination in {@link renderScenarioPlanning} can decide
 * whether to keep the force inline or promote it to a feature page.
 */
function measureDrivingForceRowH(doc: jsPDF, f: DrivingForce, idx: number): number {
  // Matches the (tightened) geometry of {@link renderPlanningRow}: eyebrow numeral
  // + 16pt label at 6.4mm leading + 3.5mm gap-to-rule + body (10pt sans). The
  // INK colour here only affects {@link doc.getTextWidth} for the score — it
  // matches the render-time font, not a deliberate accent choice.
  setText(doc, INK, 18, 'bold', FONT_SERIF);
  const scoreStr = `${Math.round(f.impactScore ?? 0)}%`;
  const statW = doc.getTextWidth(scoreStr) + 4;
  const labelMaxW = CONTENT_W - 12 - statW;
  setText(doc, INK, 16, 'bold', FONT_SERIF);
  const labelLines = doc.splitTextToSize(f.title, labelMaxW) as string[];
  const headingH = 6 + labelLines.length * 6.4 + 5 + 3.5;
  const desc = T(`scenarioPlanning.drivingForces.${idx}.description`, f.description);
  const descH = desc
    ? measureBody(doc, desc, {
        size: 10,
        family: FONT_SANS,
        maxWidth: CONTENT_W - 12,
        leading: 5.2,
      })
    : 0;
  return headingH + descH + 1;
}

/**
 * Dedicated feature page for overflowing driving forces. Renders 1 or 2
 * forces with a hero-sized treatment — massive rank numeral, big serif
 * title, oversized score, and a 2-column description body. Makes a page
 * of "leftover" forces look like an intentional editorial spread rather
 * than orphaned filler.
 */
function renderDrivingForcesFeaturePage(doc: jsPDF, entries: Array<{ force: DrivingForce; idx: number }>): void {
  let y = addPage(doc);
  drawRunningHead(doc);
  // Section eyebrow — uses the planning section's blue accent so the
  // overflow page reads as part of the same chapter.
  setText(doc, BLUE, 7.5, 'bold', FONT_MONO);
  const en = isEnLang();
  doc.text(
    (en ? 'Scenario planning · Driving forces' : 'Planificación · Fuerzas motrices').toUpperCase(),
    MARGIN_X,
    y,
  );
  doc.setDrawColor(LINE_ACCENT);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, y + 2.5, PAGE_W - MARGIN_X, y + 2.5);
  y += 12;

  if (entries.length === 1) {
    renderDrivingForceHero(doc, y, entries[0].force, entries[0].idx, true);
  } else {
    const halfH = (PAGE_BOTTOM - y - 18) / 2;
    renderDrivingForceHero(doc, y, entries[0].force, entries[0].idx, false, halfH);
    // Mid-page rule between the two forces
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, y + halfH + 6, PAGE_W - MARGIN_X, y + halfH + 6);
    renderDrivingForceHero(doc, y + halfH + 14, entries[1].force, entries[1].idx, false, halfH);
  }
}

/**
 * One driving force at hero scale. Used by the overflow feature page.
 *
 * @param full when true, the rank numeral is rendered at full-page
 *             scale (80pt) and the description gets a 2-column body
 *             across the full content width. When false, the force
 *             takes the top OR bottom half of a page (2 forces per
 *             page); numeral steps down to 60pt and the description
 *             body uses a single full-width column.
 * @param maxBodyH optional cap on body height (used by the 2-per-page
 *             variant so the second force doesn't push off-page).
 */
function renderDrivingForceHero(
  doc: jsPDF,
  yIn: number,
  f: DrivingForce,
  idx: number,
  full: boolean,
  maxBodyH?: number,
): number {
  const colors = { fg: GOLD, bg: GOLD_BG };
  const score = Math.max(0, Math.min(100, Math.round(f.impactScore ?? 0)));
  const numSize = full ? 80 : 60;
  const titleSize = full ? 24 : 18;
  const titleLead = titleSize * 0.5;
  const scoreSize = full ? 30 : 22;
  const en = isEnLang();
  const numCol = full ? 50 : 38; // mm reserved for the rank lockup
  const textX = MARGIN_X + numCol + 6;
  const textW = CONTENT_W - numCol - 6;

  let y = yIn;
  // ── Left lockup: massive rank numeral
  setText(doc, colors.fg, numSize, 'bold', FONT_SERIF);
  doc.text(String(f.rank), MARGIN_X, y + numSize * 0.7);
  // Kicker under the numeral
  setText(doc, INK_MUTE, 7, 'bold', FONT_MONO);
  doc.text(
    (en ? 'Driving force' : 'Fuerza motriz').toUpperCase(),
    MARGIN_X,
    y + numSize * 0.7 + 5,
  );

  // ── Right column: title + score + description
  let ty = y + 4;
  setText(doc, INK, titleSize, 'bold', FONT_SERIF);
  const titleLines = doc.splitTextToSize(f.title, textW) as string[];
  for (const ln of titleLines) {
    doc.text(ln, textX, ty + titleSize * 0.4);
    ty += titleLead;
  }
  ty += 4;

  // Score row: big percentage + bar + label
  setText(doc, colors.fg, scoreSize, 'bold', FONT_SERIF);
  doc.text(`${score}%`, textX, ty + scoreSize * 0.4);
  const pctW = doc.getTextWidth(`${score}%`);
  // Bar + label aligned right of the percentage
  const barW = textW - pctW - 6;
  bar(doc, textX + pctW + 4, ty + scoreSize * 0.4 - 2, barW, score, colors.fg);
  setText(doc, INK_MUTE, 7, 'bold', FONT_MONO);
  doc.text(
    (en ? 'Impact score' : 'Impacto').toUpperCase(),
    textX + pctW + 4,
    ty + scoreSize * 0.4 + 4,
  );
  ty += scoreSize * 0.5 + 6;

  // Description — 2 columns when full-page, 1 column otherwise. Capped
  // by maxBodyH on the half-page variant so the bottom force doesn't
  // bleed past the page break.
  const desc = T(`scenarioPlanning.drivingForces.${idx}.description`, f.description);
  if (desc) {
    const usedH = ty - y;
    const remaining = (maxBodyH ?? (PAGE_BOTTOM - ty - 6)) - usedH;
    if (full) {
      ty = flowColumns(doc, textX, ty, textW, desc, {
        columns: 2,
        gutter: 6,
        size: 11,
        family: FONT_SERIF,
        leading: 5.6,
        color: INK_SOFT,
        maxHeight: Math.max(20, remaining),
      });
    } else {
      ty = body(doc, ty, desc, {
        indent: textX,
        maxWidth: textW,
        color: INK_SOFT,
        size: 10,
        leading: 5.2,
        family: FONT_SERIF,
        trailingGap: 0,
      });
    }
  }
  return ty;
}

/**
 * Single driving-force row — styled identically to {@link renderAxisRow} and
 * {@link renderScenarioLogicRow} so all Scenario-Planning subsections share one
 * visual signature: gold numeral eyebrow + large serif label + optional right-side
 * stat + thin gold rule + body block.
 */
function renderDrivingForceRow(doc: jsPDF, yIn: number, f: DrivingForce, idx: number): number {
  const score = Math.max(0, Math.min(100, Math.round(f.impactScore ?? 0)));
  const scoreStr = `${score}%`;
  const desc = T(`scenarioPlanning.drivingForces.${idx}.description`, f.description);
  return renderPlanningRow(doc, yIn, {
    eyebrowNum: String(f.rank).padStart(2, '0'),
    label: f.title,
    rightStat: scoreStr,
    rightStatLabel: isEnLang() ? 'Impact' : 'Impacto',
    body: desc,
  });
}

/**
 * Pre-measure one axis row's total height. Used by the planning pager to decide
 * whether the next axis fits on the current page before drawing it.
 *
 * Mirrors the layout produced by {@link renderAxisRow}: heading (16pt label,
 * eyebrow numeral), spectrum (poles side-by-side at 11pt), then rationale block
 * (10pt body with its own eyebrow). Heading + rule is ~14mm; spectrum + rationale
 * are content-driven.
 */
function measureAxisRow(doc: jsPDF, a: UncertaintyAxis, idx: number): number {
  setText(doc, INK, 16, 'bold', FONT_SERIF);
  const labelLines = doc.splitTextToSize(a.label, CONTENT_W - 12) as string[];
  // Heading geometry mirrors renderPlanningRow + the +5mm push-down that
  // renderAxisRow's drawBody applies so the ± pills don't collide with the
  // structural rule under the label.
  const headingH = 6 + labelLines.length * 6.4 + 5 + 3.5 + 5;
  const halfW = (CONTENT_W - 10) / 2 - 9;
  const poleLowH = a.poleLow
    ? measureBody(doc, a.poleLow, { size: 11, family: FONT_SANS, maxWidth: halfW, leading: 5.6 })
    : 0;
  const poleHighH = a.poleHigh
    ? measureBody(doc, a.poleHigh, { size: 11, family: FONT_SANS, maxWidth: halfW, leading: 5.6 })
    : 0;
  const spectrumH = Math.max(poleLowH, poleHighH) + 4;
  const rationale = T(`scenarioPlanning.axes.${idx}.rationale`, a.rationale);
  const rationaleH = rationale
    ? 9 + measureBody(doc, rationale, { size: 10, family: FONT_SANS, maxWidth: CONTENT_W - 12, leading: 5.2 })
    : 0;
  return headingH + spectrumH + (rationale ? 4 + rationaleH : 0);
}

/**
 * Full-width axis row — uses the shared {@link renderPlanningRow} signature so
 * the axis matches the visual styling of driving-force and scenario-logic rows.
 * The poles (the actual axis spectrum) are drawn in the body callback below the
 * unified heading + rule, with the justification rendered underneath in its own
 * sub-zone (eyebrow label + body) so the "why" reads as a deliberate block.
 */
function renderAxisRow(
  doc: jsPDF,
  yIn: number,
  a: UncertaintyAxis,
  idx: number,
): number {
  const labelX = MARGIN_X + 12;
  return renderPlanningRow(doc, yIn, {
    eyebrowNum: String(idx + 1).padStart(2, '0'),
    label: a.label,
    drawBody: (yBody) => {
      // Push the pole row down so the ± pills clear the thin LINE_STRONG rule
      // that renderPlanningRow draws under the label. The pill is taller than
      // the gap renderPlanningRow leaves (3.5mm), and since the pill is
      // anchored at the left margin where the rule also starts, they
      // collided visually — the rule cut horizontally through the − badge.
      let y = yBody + 5;
      // ── Spectrum row: poleLow LEFT, poleHigh RIGHT.
      const colGap = 10;
      const colW = (CONTENT_W - 12 - colGap) / 2;
      const halfW = colW - 9;
      const leftX = labelX;
      const rightX = labelX + colW + colGap;
      const poleY = y + 2;
      if (a.poleLow) {
        pill(doc, leftX, poleY - 4, '−', RED, RED_BG);
        body(doc, poleY, a.poleLow, {
          indent: leftX + 9,
          maxWidth: halfW,
          size: 11,
          color: INK,
          family: FONT_SANS,
          leading: 5.6,
          trailingGap: 0,
        });
      }
      if (a.poleHigh) {
        pill(doc, rightX, poleY - 4, '+', GREEN, GREEN_BG);
        body(doc, poleY, a.poleHigh, {
          indent: rightX + 9,
          maxWidth: halfW,
          size: 11,
          color: INK,
          family: FONT_SANS,
          leading: 5.6,
          trailingGap: 0,
        });
      }
      const poleLowH = a.poleLow
        ? measureBody(doc, a.poleLow, { size: 11, family: FONT_SANS, maxWidth: halfW, leading: 5.6 })
        : 0;
      const poleHighH = a.poleHigh
        ? measureBody(doc, a.poleHigh, { size: 11, family: FONT_SANS, maxWidth: halfW, leading: 5.6 })
        : 0;
      y = poleY + Math.max(poleLowH, poleHighH) + 2;

      // ── Rationale sub-block.
      const rationale = T(`scenarioPlanning.axes.${idx}.rationale`, a.rationale);
      if (rationale) {
        y += 4;
        setText(doc, INK_MUTE, 6.5, 'bold', FONT_MONO);
        doc.text(tx('report.results.sp.rationale', 'Rationale').toUpperCase(), labelX, y);
        y = body(doc, y + 4, rationale, {
          indent: labelX,
          maxWidth: CONTENT_W - 12,
          size: 10,
          color: INK_SOFT,
          family: FONT_SANS,
          leading: 5.2,
          trailingGap: 0,
        });
      }
      return y;
    },
  });
}

/* ── Section: Backcasting ─────────────────────────────────────────── */

function renderBackcasting(doc: jsPDF, entries: BackcastingEntry[]): number {
  let y = 0;
  for (let i = 0; i < entries.length; i++) {
    // Per-scenario section: rotated eyebrow reads the scenario name on
    // every page of that scenario's backcasting, coloured to match. Each
    // entry gets its own fresh page so the headline doesn't get buried.
    const e = entries[i];
    const colors = scenarioColors(e.scenarioType, i);
    setSection(
      doc,
      `${isEnLang() ? 'Backcasting' : 'Backcasting'} · ${e.scenarioType ?? `Scenario ${i + 1}`}`,
      colors.fg,
    );
    y = addPage(doc);
    drawRunningHead(doc);
    if (i === 0) {
      // First entry records the TOC anchor for the whole backcasting
      // section, since there's no longer a standalone opener page.
      recordSection(doc, tx('report.results.tabs.bc', 'Backcasting'), ORANGE);
    }
    y = renderBackcastingEntry(doc, y, e, i);
  }
  return y;
}

/**
 * Magazine-style backcasting feature page: pill + headline lockup,
 * full-width italic vision deck, then a vertical timeline of milestones
 * where each year is set as an oversized numeral in the scenario colour
 * with a connector rule joining to the next milestone. Reads like a
 * "looking back from the future" feature in TIME — past-tense narrative
 * with the milestone year as the dominant visual anchor.
 */
function renderBackcastingEntry(
  doc: jsPDF,
  yIn: number,
  e: BackcastingEntry,
  idx: number,
): number {
  const colors = scenarioColors(e.scenarioType, idx);
  const en = isEnLang();
  let y = yIn;

  // ── Kicker + headline ────────────────────────────────────────────
  // Neutral grey kicker — the scenario's identity colour is already loud on
  // the big two-color split headline beneath, so the small mono-caps eyebrow
  // stays quiet (per "colours only for accents" policy).
  setText(doc, INK_MUTE, 7.5, 'bold', FONT_MONO);
  doc.text(
    `${(en ? 'Backcasting' : 'Backcasting').toUpperCase()} · ${(e.scenarioType ?? '').toUpperCase()}`,
    MARGIN_X,
    y + 2,
  );
  y += 6;

  // Two-color split headline: scenario name in scenario colour as a
  // single chunk so wrapping carries the colour across lines. Sized
  // generously — this is the visual anchor of the page.
  y = splitColorHeadline(
    doc,
    MARGIN_X,
    y + 12,
    CONTENT_W,
    [{ text: e.scenarioName ?? '', color: colors.fg }],
    { size: 30, leading: -8, family: FONT_SERIF, weight: 'bold' },
  );
  y += 1;

  doc.setDrawColor(colors.fg);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_X, y, MARGIN_X + 26, y);
  y += 8;

  // ── Vision statement as italic deck ──────────────────────────────
  if (e.visionStatement) {
    const vision = T(`backcasting.${idx}.visionStatement`, e.visionStatement);
    y = standfirst(doc, MARGIN_X, y, CONTENT_W, vision, {
      size: 13.5,
      color: INK,
      leading: 7.2,
    });
    y += 5;
  }

  // ── Timeline of milestones ───────────────────────────────────────
  // Layout: a vertical connector line in the scenario colour runs down
  // the left side at YEAR_GUTTER. Each milestone has a huge year numeral
  // sitting against the gutter, with title + body + actions flowing in
  // the right column. The connector visually threads them together.
  if (e.milestones?.length) {
    const YEAR_COL_W = 30; // mm reserved for the big year numeral
    const TEXT_X = MARGIN_X + YEAR_COL_W + 4;
    const TEXT_W = CONTENT_W - YEAR_COL_W - 4;
    const railX = MARGIN_X + YEAR_COL_W - 1;

    // subLabel for the timeline opener
    y = subheadCap(doc, MARGIN_X, y, en ? 'Trajectory' : 'Trayectoria', colors.fg);
    y += 3;
    const railStart = y;

    for (let mi = 0; mi < e.milestones.length; mi++) {
      const m = e.milestones[mi];
      const mDesc = T(`backcasting.${idx}.milestones.${mi}.description`, m.description);
      // Pre-measure block so we can paginate before the year numeral
      // and avoid orphaning the year on the previous page.
      const titleLines = (() => {
        setText(doc, INK, 13.5, 'bold', FONT_SERIF);
        return doc.splitTextToSize(m.title ?? '', TEXT_W) as string[];
      })();
      const titleH = titleLines.length * 6;
      const descH = mDesc
        ? measureBody(doc, mDesc, {
            size: 10,
            family: FONT_SANS,
            maxWidth: TEXT_W,
            leading: 5.2,
          })
        : 0;
      let actionsH = 0;
      if (m.actions?.length) {
        const aSize = 9;
        const aLead = aSize * 0.55;
        for (const a of m.actions) {
          const lines = doc.splitTextToSize(a, TEXT_W - 4) as string[];
          actionsH += lines.length * aLead + 0.4;
        }
        actionsH += 1;
      }
      const blockH = titleH + descH + actionsH + 8;

      // The year numeral sits near the top of the block. Previously this reserved
      // 24mm minimum which produced a tall rail-line under short milestones —
      // dropped to 14mm so we can pack more years per page (per user request).
      const reserved = Math.max(blockH, 14);
      y = checkY(doc, y, reserved + 4);

      // Year numeral — anchored near the top of the block so the rail line
      // beneath it is as short as the content allows.
      if (m.year) {
        bigNumeral(doc, MARGIN_X, y + 10, m.year, colors.fg, 26, FONT_SERIF);
      }
      // Tick on the rail at the year baseline
      doc.setFillColor(colors.fg);
      doc.circle(railX, y + 4, 1.4, 'F');

      // Right column — title
      let ty = y + 4;
      setText(doc, INK, 13.5, 'bold', FONT_SERIF);
      for (const ln of titleLines) {
        doc.text(ln, TEXT_X, ty);
        ty += 6;
      }
      ty += 1;
      // Description
      if (mDesc) {
        ty = body(doc, ty, mDesc, {
          indent: TEXT_X,
          maxWidth: TEXT_W,
          color: INK_SOFT,
          size: 10,
          leading: 5.2,
          trailingGap: 1,
        });
      }
      // Actions
      if (m.actions?.length) {
        ty = dotBullets(doc, ty + 0.5, m.actions, colors.fg, {
          indent: TEXT_X,
          maxWidth: TEXT_W - 4,
          size: 9,
          textColor: INK_SOFT,
        });
      }
      const blockEnd = Math.max(ty, y + reserved);
      // Draw the rail segment from this milestone's tick down to the
      // next one's expected position. Stops 2mm short of the next milestone's
      // tick so the geometry breathes a little.
      doc.setDrawColor(colors.fg);
      doc.setLineWidth(0.25);
      doc.line(railX, y + 6, railX, blockEnd + 2);
      // Tightened inter-milestone gap — 3mm (was 6mm) so multiple years pack
      // more densely onto one page.
      y = blockEnd + 3;
    }
    // Final rail cap — a small terminating arrowhead on the last tick.
    void railStart; // reserved if we ever want a continuous overlay
  }

  // ── Starting point — "what to do now" ────────────────────────────
  const sp = T(`backcasting.${idx}.startingPoint`, e.startingPoint);
  if (sp) {
    // Pre-measure the whole block. Two policies, both honour:
    //   • A non-negotiable gap above the block so it never sits flush against
    //     the last milestone's bullets (regression fix — was previously zero
    //     when the milestones consumed nearly the full page).
    //   • Paragraph integrity: if the block doesn't fully fit, page-break BEFORE
    //     the rule + kicker so the body never splits mid-paragraph onto a
    //     second page.
    const MIN_GAP_ABOVE = 6; // mm — guaranteed margin between milestones and SP
    const bodyH = measureBody(doc, sp, {
      size: 11,
      family: FONT_SERIF,
      // Italic widths can differ slightly from regular — pass the same weight that
      // the renderer below uses so the line-count prediction lines up with what
      // {@link body} actually draws.
      weight: 'italic',
      maxWidth: CONTENT_W,
      leading: 5.8,
    });
    // Slim safety pad on the body measure — italic widths can drift slightly between
    // jsPDF's measure and render passes. Was 8mm but that pushed otherwise-fitting
    // blocks onto a fresh near-empty page; 3mm is enough headroom in practice.
    const blockH = 4 + 6 + bodyH + 3; // rule + kicker + body + trailing/safety
    y += MIN_GAP_ABOVE;
    const available = PAGE_BOTTOM - y;
    if (available < blockH) {
      // Whole block won't fit on the current page — page-break BEFORE drawing
      // anything so the body's paragraphs stay intact rather than splitting.
      // (User policy: "texto nunca debe estar partido en 2 paginas".)
      y = addPage(doc);
      drawRunningHead(doc);
    } else if (available - blockH > 14) {
      // Comfortably fits — push the block toward the bottom of the page so it
      // reads like a closing call-to-action under the milestones.
      const headroom = available - blockH;
      const breathing = Math.min(20, Math.max(0, headroom - 14));
      y += breathing;
    }
    // A small accent block: pull-quote-styled lead-in + body.
    doc.setDrawColor(colors.fg);
    doc.setLineWidth(0.5);
    doc.line(MARGIN_X, y, MARGIN_X + 18, y);
    y += 4;
    setText(doc, colors.fg, 8.5, 'bold', FONT_MONO);
    doc.text((tx('report.results.bc.start', 'Starting point')).toUpperCase(), MARGIN_X, y + 2);
    y += 6;
    y = body(doc, y, sp, {
      color: INK,
      size: 11,
      family: FONT_SERIF,
      weight: 'italic',
      leading: 5.8,
      trailingGap: 3,
    });
  }
  return y;
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
  const order: Array<'H1' | 'H2' | 'H3'> = ['H1', 'H2', 'H3'];
  const horizonColors: Record<'H1' | 'H2' | 'H3', string> = {
    H1: GREEN,
    H2: BLUE,
    H3: PURPLE,
  };
  const horizonLabels: Record<'H1' | 'H2' | 'H3', string> = {
    H1: isEnLang() ? 'Horizon 1' : 'Horizonte 1',
    H2: isEnLang() ? 'Horizon 2' : 'Horizonte 2',
    H3: isEnLang() ? 'Horizon 3' : 'Horizonte 3',
  };
  // Each horizon owns its own page so the H1 / H2 / H3 lockup never collides
  // with the previous horizon's priorities mid-page. Within a horizon, priorities
  // pack onto the current page until one wouldn't fit — at which point we paginate
  // AND redraw a compact "Hn (cont.)" header so the reader doesn't lose context
  // (previous behaviour left the overflow page bare).
  let y = 0;
  let first = true;
  for (const h of order) {
    const group = items.filter((it) => it.horizon === h);
    if (group.length === 0) continue;
    setSection(doc, `${isEnLang() ? 'Strategic Map' : 'Mapa Estratégico'} · ${horizonLabels[h]}`, horizonColors[h]);
    y = addPage(doc);
    drawRunningHead(doc);
    if (first) {
      // Only the first horizon records the section TOC anchor — there's
      // no separate opener page anymore.
      y = pageHeader(
        doc,
        y,
        tx('report.results.tabs.str', 'Strategic map'),
        isEnLang() ? 'Priorities' : 'Prioridades',
        PURPLE,
      );
      first = false;
    }
    y = renderHorizonHeader(doc, y, h, horizonColors[h]);
    // Preserve the priority's original index in the strategicMap array — the path used by
    // collectFieldNeeds / T() keys on the unfiltered index, not on the per-horizon position.
    for (const it of group) {
      const originalIdx = items.indexOf(it);
      // Pre-measure the card so we can paginate BEFORE drawing it (rather than
      // having renderPriorityCardWide's internal checkY produce a bare overflow
      // page with no horizon context).
      const cardH = measurePriorityCardH(doc, it, originalIdx);
      if (y + cardH + 3 > PAGE_BOTTOM) {
        y = addPage(doc);
        drawRunningHead(doc);
        y = renderHorizonHeaderCompact(doc, y, h, horizonColors[h]);
      }
      y = renderPriorityCardWide(doc, y, it, horizonColors[h], originalIdx);
    }
  }
  return y;
}

/**
 * Pre-measure a priority card's height matching {@link renderPriorityCardWide}'s
 * layout. Pulled out so the strategic-map loop can paginate BEFORE drawing.
 */
function measurePriorityCardH(doc: jsPDF, it: StrategicPriority, originalIdx: number): number {
  const innerPad = 6;
  const innerW = CONTENT_W - innerPad * 2;
  setText(doc, INK, 12, 'bold', FONT_SERIF);
  const titleLines = doc.splitTextToSize(it.title, innerW - 30) as string[];
  const titleH = titleLines.length * 6;
  const tightenedActions = (it.actions ?? []).map((a, j) =>
    T(`strategicMap.${originalIdx}.actions.${j}`, a),
  );
  let actionsH = 0;
  if (tightenedActions.length) {
    const size = 9;
    const leading = size * 0.55;
    setText(doc, INK_SOFT, size, 'normal', FONT_SANS);
    for (const a of tightenedActions) {
      const lines = doc.splitTextToSize(a, innerW - 6) as string[];
      actionsH += lines.length * leading + 0.4;
    }
    actionsH += 2;
  }
  const tframeH = it.timeframe ? 5 : 0;
  return innerPad + titleH + tframeH + actionsH + innerPad - 2;
}

/**
 * Compact horizon header used when a horizon's priorities spill onto a fresh
 * continuation page. Keeps the H identity visible without re-drawing the full
 * lockup again (which would waste 30mm of vertical space).
 */
function renderHorizonHeaderCompact(
  doc: jsPDF,
  yIn: number,
  h: 'H1' | 'H2' | 'H3',
  color: string,
): number {
  const en = isEnLang();
  setText(doc, color, 14, 'bold', FONT_SERIF);
  doc.text(h, MARGIN_X, yIn + 8);
  setText(doc, INK_MUTE, 7.5, 'bold', FONT_MONO);
  doc.text(
    `${(en ? 'Horizon' : 'Horizonte').toUpperCase()} ${h.slice(1)} · ${(en ? 'Continued' : 'Continuación').toUpperCase()}`,
    MARGIN_X + 10,
    yIn + 8,
  );
  doc.setDrawColor(color);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, yIn + 11, PAGE_W - MARGIN_X, yIn + 11);
  return yIn + 18;
}

/**
 * Compact horizon section header — big colored badge + horizon
 * timeframe label, with a thin colored rule below. Keeps the
 * horizon's identity attached to its first priority card by reserving
 * enough space for the header + a minimum-height card.
 */
function renderHorizonHeader(doc: jsPDF, yIn: number, h: 'H1' | 'H2' | 'H3', color: string): number {
  // Huge horizon lockup in TIME / Cosmo style: massive numeral on the
  // left, kicker + label stacked on the right, gold rule below the row.
  // Reserves enough vertical real estate that the lockup never compresses.
  const blockH = 30;
  let y = checkY(doc, yIn, blockH + 6);
  // The horizon code as a display numeral. 48pt serif, anchored low so
  // its baseline sits with the bottom of the row.
  setText(doc, color, 48, 'bold', FONT_SERIF);
  const codeW = doc.getTextWidth(h);
  doc.text(h, MARGIN_X, y + 20);
  // Right-side stack: small "Horizon X" kicker in mono caps + the
  // localised horizon label in larger serif.
  const en = isEnLang();
  const kx = MARGIN_X + codeW + 6;
  setText(doc, INK_MUTE, 7.5, 'bold', FONT_MONO);
  doc.text(
    `${(en ? 'Horizon' : 'Horizonte').toUpperCase()} ${h.slice(1)}`,
    kx,
    y + 6,
  );
  setText(doc, INK, 18, 'bold', FONT_SERIF);
  doc.text(tx(`report.results.str.${h.toLowerCase()}`, h), kx, y + 16);
  // Rule across the page in the horizon colour
  doc.setDrawColor(color);
  doc.setLineWidth(0.6);
  doc.line(MARGIN_X, y + blockH - 4, PAGE_W - MARGIN_X, y + blockH - 4);
  return y + blockH;
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
  originalIdx: number,
): number {
  const colors = impactColors(it.impact);
  const innerPad = 6;
  const innerW = CONTENT_W - innerPad * 2;
  setText(doc, INK, 12, 'bold', FONT_SERIF);
  const titleLines = doc.splitTextToSize(it.title, innerW - 30) as string[];
  const titleH = titleLines.length * 6;
  // Pull tightened actions for measure so card height matches what we'll draw.
  const tightenedActions = (it.actions ?? []).map((a, j) =>
    T(`strategicMap.${originalIdx}.actions.${j}`, a),
  );
  let actionsH = 0;
  if (tightenedActions.length) {
    const size = 9;
    const leading = size * 0.55;
    // IMPORTANT: setText to the bullet's render font BEFORE splitTextToSize.
    // jsPDF measures wrap widths against the CURRENT font in the doc, so without
    // this call we were measuring against whatever font was last set (often the
    // 18pt serif from renderHorizonHeader), yielding way too few chars per line
    // and an inflated cardH that triggered a false addPage between priorities.
    setText(doc, INK_SOFT, size, 'normal', FONT_SANS);
    for (const a of tightenedActions) {
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
  if (tightenedActions.length) {
    ty = dotBullets(doc, ty + 1, tightenedActions, horizonColor, {
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
  setSection(doc, isEnLang() ? 'Signals & Wildcards' : 'Señales y Wildcards', PURPLE);
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
    // Wildcards always start on their own page — they're the visually
    // heaviest cards in the report (large numerals, full-width prose)
    // and stacking them after a busy signals grid produces a top-heavy
    // spread. A clean page break gives the wildcards their own breath.
    y = addPage(doc);
    drawRunningHead(doc);
    y = sectionLabel(doc, y, tx('report.results.sig.wildcards', 'Wildcards'), PURPLE);
    wildcards.forEach((w, i) => {
      y = renderWildcardCard(doc, y, w, i);
    });
  }
  return y;
}

/**
 * Signals 2-column grid. Pairs signals up and aligns row heights for a tidy editorial grid.
 *
 * <p>Layout chosen by {@link planLayouts}:
 * <ul>
 *   <li>{@code 'one-page'}: all 5 signals on a single page (typical 2 + 2 + 1 row layout)</li>
 *   <li>{@code 'two-page'}: 3 signals on page 1, 2 on page 2 — used when descriptions are
 *       long enough that fitting all 5 would need over-aggressive AI shortening.</li>
 * </ul>
 */
function renderSignalsGrid(doc: jsPDF, yIn: number, signals: WeakSignal[]): number {
  let y = yIn;
  const gap = 6;
  const colW = (CONTENT_W - gap) / 2;
  // 'two-page' layout: break after the first 3 signals (2 rows: pair + lone).
  const splitAfter = layoutChoices.signals === 'two-page' ? 3 : signals.length;
  for (let i = 0; i < signals.length; i += 2) {
    if (i > 0 && i === splitAfter) {
      y = addPage(doc);
      drawRunningHead(doc);
      y += 4;
    }
    const pair = signals.slice(i, i + 2);
    const heights = pair.map((s, j) => measureWeakSignalCard(doc, s, colW, i + j));
    const rowH = Math.max(...heights);
    y = checkY(doc, y, rowH + 4);
    pair.forEach((s, idx) => {
      const x = MARGIN_X + idx * (colW + gap);
      drawWeakSignalCard(doc, x, y, colW, rowH, s, i + idx);
    });
    y += rowH + gap;
  }
  return y;
}

function measureWeakSignalCard(doc: jsPDF, s: WeakSignal, w: number, idx: number): number {
  const innerPad = 5;
  const innerW = w - innerPad * 2;
  const titleLines = doc.splitTextToSize(s.title, innerW - 12) as string[];
  const titleH = titleLines.length * 5;
  const dimH = s.dimension ? 4 : 0;
  const desc = T(`weakSignals.${idx}.description`, s.description);
  const descH = desc
    ? measureBody(doc, desc, { size: 8.5, family: FONT_SANS, maxWidth: innerW - 12, leading: 4.4 })
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
  idx: number,
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
  const desc = T(`weakSignals.${idx}.description`, s.description);
  if (desc) {
    body(doc, ty + 0.5, desc, {
      indent: titleX,
      maxWidth: titleMaxW,
      color: INK_SOFT,
      size: 8.5,
      leading: 4.4,
      trailingGap: 0,
    });
  }
}

function renderWildcardCard(doc: jsPDF, yIn: number, w: Wildcard, idx: number): number {
  const innerPad = 6;
  // The stripe lives in the gutter; subtract its width from the inner content area so
  // wrapping accounts for the visible text frame rather than the full card width.
  const stripeW = 3;
  const innerW = CONTENT_W - innerPad * 2 - stripeW;
  // IMPORTANT: set the title's font BEFORE splitTextToSize — jsPDF measures against
  // the doc's CURRENT font, so without this the wrap width is computed against
  // whatever font happened to be active (typically smaller), and the rendered title
  // overflows the card horizontally. This was the root cause of the reported
  // "titles overflow the boxes" symptom.
  setText(doc, PURPLE, 13.5, 'bold', FONT_SERIF);
  const titleLines = doc.splitTextToSize(w.title, innerW) as string[];
  const titleH = titleLines.length * 6.5;
  const desc = T(`wildcards.${idx}.description`, w.description);
  const descH = desc
    ? measureBody(doc, desc, { size: 10.5, family: FONT_SANS, maxWidth: innerW, leading: 5.4 })
    : 0;
  const cardH = innerPad + titleH + (desc ? 3 + descH : 0) + innerPad - 2;
  const y = checkY(doc, yIn, cardH + 4);
  card(doc, MARGIN_X, y, CONTENT_W, cardH, { fill: SURFACE_2, stripe: PURPLE });
  // Re-set the font after card() in case it touched the graphics state.
  setText(doc, PURPLE, 13.5, 'bold', FONT_SERIF);
  const titleX = MARGIN_X + innerPad + stripeW;
  let ty = y + innerPad + 6;
  for (const ln of titleLines) {
    doc.text(ln, titleX, ty);
    ty += 6.5;
  }
  if (desc) {
    body(doc, ty + 1, desc, {
      indent: titleX,
      maxWidth: innerW,
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
  setSection(doc, isEnLang() ? 'Sources' : 'Fuentes', INK_MUTE);
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
    // Source index numeral — neutral typographic style, matches section
    // numbers everywhere else in the report.
    setText(doc, INK_MUTE, 8, 'bold', FONT_MONO);
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

function addFootersAndHeads(
  doc: jsPDF,
  reportTitle: string,
  tocPageNum: number,
  backCoverPageNum: number | null = null,
) {
  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    // Back cover renders its own chrome — skip the standard running head,
    // rotated eyebrow, footer rule, and page-number chip.
    if (p === backCoverPageNum) continue;
    const section = pageSections[p];
    // Skip drawing a duplicate running head over the TOC (already drawn).
    // Section openers also already drew the head; redraw is idempotent.
    if (p !== tocPageNum) drawRunningHead(doc, reportTitle);
    // Rotated section eyebrow on the left margin — TIME-style
    // `[ SECTION NAME ]` reading bottom-to-top. Only on content pages
    // where we know the current section.
    if (section && p !== tocPageNum) {
      drawSectionEyebrow(doc, section.label, section.color);
    }
    // Footer rule + wordmark + page-number chip. The footer rule is GOLD —
    // brand element that mirrors the running head's gold rule, framing every
    // content page top and bottom.
    doc.setDrawColor(GOLD);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_X, PAGE_H - 14, PAGE_W - MARGIN_X, PAGE_H - 14);
    setText(doc, GOLD, 7, 'bold', FONT_MONO);
    doc.text('FUTUROS', MARGIN_X, PAGE_H - 8);
    // Page-number chip: ALWAYS neutral grey now (per user policy: page
    // indicators are not accents and shouldn't change colour per section).
    // Section identity already shows up via the rotated eyebrow on the left
    // margin — the chip stays quiet.
    const chipFg = INK_MUTE;
    const chipBg = SURFACE_2;
    const pageStr = `${p} / ${total}`;
    setText(doc, chipFg, 7, 'bold', FONT_MONO);
    const pw = doc.getTextWidth(pageStr);
    const chipPadX = 3;
    const chipH = 4.6;
    const chipW = pw + chipPadX * 2;
    doc.setFillColor(chipBg);
    doc.roundedRect(
      PAGE_W - MARGIN_X - chipW,
      PAGE_H - 8 - chipH + 1.2,
      chipW,
      chipH,
      1.2,
      1.2,
      'F',
    );
    setText(doc, chipFg, 7, 'bold', FONT_MONO);
    doc.text(pageStr, PAGE_W - MARGIN_X - chipW + chipPadX, PAGE_H - 8);
  }
}

/**
 * Mix the given hex colour with the page background at the given alpha.
 * Used for translucent-looking chip backgrounds when jsPDF can't render
 * actual alpha (the PDF spec supports it via graphics state, but the
 * shortcut of pre-blending against BG is good enough for chrome).
 */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  const bgM = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(BG);
  const br = bgM ? parseInt(bgM[1], 16) : 10;
  const bg2 = bgM ? parseInt(bgM[2], 16) : 10;
  const bb = bgM ? parseInt(bgM[3], 16) : 13;
  const mix = (a: number, b: number) => Math.round(a * alpha + b * (1 - alpha));
  const rr = mix(r, br).toString(16).padStart(2, '0');
  const gg = mix(g, bg2).toString(16).padStart(2, '0');
  const bbb = mix(b, bb).toString(16).padStart(2, '0');
  return `#${rr}${gg}${bbb}`;
}
// Currently unused — kept around in case the chip / pill chrome wants
// translucent fills again. Reference it so the linter doesn't flag dead code.
void withAlpha;

/**
 * Walk the report and emit one {@link FieldNeed} per text field that may need shortening to
 * fit a target magazine layout. The fit pass below uses these to decide which fields to
 * tighten in parallel via /api/ai/tighten.
 *
 * <p>Each section module is responsible for its own budgets; this central collector keeps
 * the budget knobs in one place so the orchestrator can read them at a glance. Budgets are
 * conservative — slightly under what the layout strictly allows — so the model's output has
 * margin to slot in cleanly without hitting line-overflow guards.
 *
 * <p>Currently only the Brief section is layout-budgeted. The other 7 sections will join the
 * same pipeline in follow-up commits: their renderers just need to be refactored to read
 * {@link pickText} at the text seam and to declare their needs here.
 */
function collectFieldNeeds(
  _input: InputData,
  result: ResultData | null,
  cp: CompanyProfile,
  _language: 'es' | 'en',
): FieldNeed[] {
  const out: FieldNeed[] = [];

  // Preserve-terms shared across most fields: the org name, the sector (these
  // appear in many fields and must not get paraphrased away), and the
  // consultant name when present.
  const sharedPreserve: string[] = [];
  if (cp.name) sharedPreserve.push(cp.name);
  if (cp.sector) sharedPreserve.push(cp.sector);
  if (cp.consultantName) sharedPreserve.push(cp.consultantName);
  if (cp.consultantCompany) sharedPreserve.push(cp.consultantCompany);

  // Budgets pulled from {@link budgetFor} — the chosen-layout cap is the AI's target. The
  // chooser already verified each source can plausibly hit this without too-aggressive
  // shortening (it would have stepped down to a looser layout otherwise), so the AI's
  // tightened output is trusted verbatim at the render seam.
  const need = (path: string, source: string | undefined) => {
    if (!source) return;
    const b = budgetFor(path);
    if (b && source.length > b) {
      out.push({ path, source, targetChars: b, preserveTerms: sharedPreserve });
    }
  };

  // Brief — exec must fit one page next to BRIEF sidebar.
  need('executiveSummary', result?.executiveSummary);

  // STEEP — paths key on normalised dim codes so they match what the renderer reads.
  const gN = normalizeSteepKeys(_input.globalSteep);
  const sN = normalizeSteepKeys(_input.steep);
  for (const k of ['S', 'T', 'E', 'ENV', 'P'] as const) {
    need(`steep.global.${k}`, gN[k]);
    need(`steep.sectorial.${k}`, sN[k]);
  }
  result?.keyUncertainties?.forEach((u, i) => need(`keyUncertainties.${i}.description`, u.description));
  result?.scenarios?.forEach((s, i) => {
    need(`scenarios.${i}.description`, s.description);
    need(`scenarios.${i}.firstMove`, s.firstMove);
  });
  const sp = result?.scenarioPlanning;
  if (sp) {
    need('scenarioPlanning.intro', sp.intro);
    // Driving forces are rendered in rank order — sort here too so the path indices match
    // what the renderer iterates. Without this, T(`...drivingForces.${sortedIdx}...`) at
    // the render seam would look up the wrong tightened entry.
    const sortedForces = [...(sp.drivingForces ?? [])].sort((a, b) => a.rank - b.rank);
    sortedForces.forEach((f, i) => need(`scenarioPlanning.drivingForces.${i}.description`, f.description));
    sp.axes?.forEach((a, i) => need(`scenarioPlanning.axes.${i}.rationale`, a.rationale));
    sp.scenarioLogics?.forEach((l, i) => need(`scenarioPlanning.scenarioLogics.${i}.logic`, l.logic));
  }
  result?.backcasting?.forEach((e, i) => {
    need(`backcasting.${i}.visionStatement`, e.visionStatement);
    need(`backcasting.${i}.startingPoint`, e.startingPoint);
    e.milestones?.forEach((m, j) => need(`backcasting.${i}.milestones.${j}.description`, m.description));
  });
  result?.strategicMap?.forEach((p, i) => {
    p.actions?.forEach((a, j) => need(`strategicMap.${i}.actions.${j}`, a));
  });
  result?.weakSignals?.forEach((w, i) => need(`weakSignals.${i}.description`, w.description));
  result?.wildcards?.forEach((w, i) => need(`wildcards.${i}.description`, w.description));

  return out;
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
  language?: 'es' | 'en' | 'ca',
) {
  const originalLang = i18n.language;
  const needSwitch =
    !!language && language.slice(0, 2) !== originalLang.slice(0, 2);
  if (needSwitch) await i18n.changeLanguage(language);
  // Apply the requested palette BEFORE any rendering so every paint /
  // setText / setDrawColor below reads from the chosen theme's tokens.
  setTheme(theme);
  try {
    await renderReport(report);
  } finally {
    if (needSwitch) await i18n.changeLanguage(originalLang);
    // Restore the dark default for the next export — keeps the module's
    // global token state predictable across calls.
    setTheme('dark');
  }
}

async function renderReport(report: ReportResponse) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await ensureFonts(doc);

  // Reset per-export state. Section tracking + TOC entries are module-level
  // so they don't accidentally leak between consecutive export calls.
  tocEntries.length = 0;
  currentSection = null;
  currentTightened = {};
  for (const k of Object.keys(pageSections)) delete pageSections[Number(k)];

  const input = sanitizeTree((report.inputData ?? {})) as InputData;
  const result = sanitizeTree(report.resultData ?? null) as ResultData | null;
  const cp = input.companyProfile ?? {};
  const en = isEnLang();
  const exportLang: 'es' | 'en' = en ? 'en' : 'es';

  // ── Layout planning + fit pass ─────────────────────────────────────
  // Step 1: measure each section's source content and pick the closest
  // layout candidate (within MAX_SHORTEN_RATIO) — favouring ideal layouts
  // first, falling back to alternatives only when content is too long to
  // shorten without losing meaning. layoutChoices is module-level so the
  // section renderers below read it to decide which variant to draw.
  planLayouts(input, result);
  // Step 2: collect every field that needs AI shortening to fit its
  // CHOSEN-layout budget, fan out parallel /api/ai/tighten calls, return
  // a path→shortened-text map. Renderers consult it via the T() accessor.
  const needs = collectFieldNeeds(input, result, cp, exportLang);
  let tightened: TightenedMap = {};
  if (needs.length > 0) {
    tightened = await runFitPass(needs, exportLang, report.pdfOptimized ?? null);
    // Best-effort persist — failures don't break the export.
    if (Object.keys(tightened).length > 0) {
      void persistTightened(report.id, exportLang, tightened);
    }
  }
  // Publish the tightened map for section renderers to consume via T().
  currentTightened = tightened;

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
    const exec = result?.executiveSummary
      ? pickText(tightened, 'executiveSummary', result.executiveSummary)
      : undefined;
    renderBriefAndExec(doc, input, exec);
  }

  // STEEP — only renders if there's actual content (after key
  // normalisation, which handles both StepGlobal short codes and
  // StepSteep full-name keys).
  const gN = normalizeSteepKeys(input.globalSteep);
  const sN = normalizeSteepKeys(input.steep);
  if (Object.keys(gN).length > 0 || Object.keys(sN).length > 0) {
    setSection(doc, isEnLang() ? 'STEEP Context' : 'Contexto STEEP', INK_MUTE);
    const yStart = addPage(doc);
    drawRunningHead(doc);
    renderSteepInputs(doc, yStart, input, tightened);
  }

  if (result) {
    if (result.keyUncertainties?.length) {
      setSection(doc, isEnLang() ? 'Key Uncertainties' : 'Incertidumbres', INK_MUTE);
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

  // 6. Back cover — closing manifesto page. Added BEFORE addFootersAndHeads so
  // the page exists when the footer loop runs; the loop is told to skip it via
  // backCoverPageNum so the standard chrome doesn't overwrite the manifesto.
  doc.addPage();
  const backCoverPageNum = (doc.getCurrentPageInfo() as { pageNumber: number }).pageNumber;
  renderBackCover(doc);

  // 7. Footers + running heads on every non-cover, non-back-cover page.
  addFootersAndHeads(doc, report.title, tocPageNum, backCoverPageNum);

  const safeName = report.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'report';
  doc.save(`${safeName}_foresight.pdf`);
}
