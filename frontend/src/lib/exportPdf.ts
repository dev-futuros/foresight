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
 * PDF export — renders the full report contents to a downloadable A4
 * document. Mirrors the on-screen tab content so the exported file
 * stands on its own as a deliverable; reads everything from the same
 * typed projection the renderer uses (see {@link ResultData} in
 * `features/report/ReportContent.tsx`).
 *
 * <p>All visible strings go through i18next so the PDF picks up the
 * user's current language. Renders synchronously with jsPDF — call
 * inside a setTimeout if the caller needs the UI to paint a busy state.
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
  /** Global STEEP (filled at wizard step 2). */
  globalSteep?: SteepBlock;
  /** Sectorial STEEP (filled at wizard step 3, stored under the bare key). */
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

/* ── Theme ────────────────────────────────────────────────────────── */

const BG = '#0F0F0F';
const TEXT = '#FFFFFF';
const SOFT = '#D5D5D5';
const MUTED = '#9CA3AF';
const ACCENT = '#C9A84C';
const LINE = '#2E2E2E';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 20;
const MARGIN_TOP = 22;
const MARGIN_BOTTOM = 24;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const PAGE_BOTTOM = PAGE_H - MARGIN_BOTTOM;

/* ── jsPDF helpers ────────────────────────────────────────────────── */

function paintBackground(doc: jsPDF) {
  doc.setFillColor(BG);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
}

function addPage(doc: jsPDF): number {
  doc.addPage();
  paintBackground(doc);
  return MARGIN_TOP;
}

/** Move forward by `needed` mm, paginating if we'd overflow. */
function checkY(doc: jsPDF, y: number, needed = 12): number {
  if (y + needed > PAGE_BOTTOM) return addPage(doc);
  return y;
}

/* ── Typography primitives ────────────────────────────────────────── */

function setText(doc: jsPDF, color: string, size: number, weight: 'normal' | 'bold' | 'italic' = 'normal') {
  doc.setTextColor(color);
  doc.setFontSize(size);
  doc.setFont('helvetica', weight);
}

/** Section header: gold uppercase eyebrow + gold underline. */
function sectionHeader(doc: jsPDF, y: number, text: string): number {
  y = checkY(doc, y, 16);
  setText(doc, ACCENT, 9, 'bold');
  doc.text(text.toUpperCase(), MARGIN_X, y);
  doc.setDrawColor(ACCENT);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X, y + 2, PAGE_W - MARGIN_X, y + 2);
  return y + 12;
}

/** Sub-section header — smaller, no rule. */
function subHeader(doc: jsPDF, y: number, text: string): number {
  y = checkY(doc, y, 10);
  setText(doc, ACCENT, 7.5, 'bold');
  doc.text(text.toUpperCase(), MARGIN_X, y);
  return y + 6;
}

/** Tight uppercase label (used for STEEP keys, force ranks, etc.). */
function inlineLabel(doc: jsPDF, x: number, y: number, text: string) {
  setText(doc, ACCENT, 7, 'bold');
  doc.text(text.toUpperCase(), x, y);
}

/** Body text — paginates line by line. Returns new y after a trailing gap. */
function body(
  doc: jsPDF,
  y: number,
  text: string,
  opts: {
    indent?: number;
    maxWidth?: number;
    color?: string;
    size?: number;
    weight?: 'normal' | 'bold' | 'italic';
    leading?: number;
    trailingGap?: number;
  } = {},
): number {
  const indent = opts.indent ?? MARGIN_X;
  const maxWidth = opts.maxWidth ?? CONTENT_W - (indent - MARGIN_X);
  const size = opts.size ?? 10;
  const leading = opts.leading ?? size * 0.5;
  const trailingGap = opts.trailingGap ?? 2;
  setText(doc, opts.color ?? SOFT, size, opts.weight ?? 'normal');
  const paragraphs = text.split(/\n{2,}/);
  for (let p = 0; p < paragraphs.length; p++) {
    const lines = doc.splitTextToSize(paragraphs[p].trim(), maxWidth) as string[];
    for (const ln of lines) {
      y = checkY(doc, y, leading + 1);
      doc.text(ln, indent, y);
      y += leading;
    }
    if (p < paragraphs.length - 1) y += leading * 0.6;
  }
  return y + trailingGap;
}

/** "LABEL\nValue" pair (uppercase gold label, white value). */
function labelValue(doc: jsPDF, y: number, label: string, value: string): number {
  y = checkY(doc, y, 14);
  inlineLabel(doc, MARGIN_X, y, label);
  y += 4.5;
  return body(doc, y, value || '—', { color: TEXT, size: 10, trailingGap: 4 });
}

/** Bulleted list. Indents continuation lines so the bullet stays hanging. */
function bullets(
  doc: jsPDF,
  y: number,
  items: string[],
  opts: { color?: string; size?: number } = {},
): number {
  const size = opts.size ?? 10;
  const leading = size * 0.5;
  setText(doc, opts.color ?? SOFT, size, 'normal');
  for (const it of items) {
    if (!it) continue;
    const lines = doc.splitTextToSize(it, CONTENT_W - 5) as string[];
    for (let i = 0; i < lines.length; i++) {
      y = checkY(doc, y, leading + 1);
      if (i === 0) {
        setText(doc, ACCENT, size, 'normal');
        doc.text('•', MARGIN_X, y);
        setText(doc, opts.color ?? SOFT, size, 'normal');
        doc.text(lines[i], MARGIN_X + 5, y);
      } else {
        doc.text(lines[i], MARGIN_X + 5, y);
      }
      y += leading;
    }
    y += 0.5;
  }
  return y + 2;
}

/** Thin horizontal rule across the content width. */
function rule(doc: jsPDF, y: number): number {
  y = checkY(doc, y, 4);
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  return y + 4;
}

/* ── i18n helpers ─────────────────────────────────────────────────── */

const t = (k: string, fallback?: string): string => {
  const v = i18n.t(k);
  if (typeof v === 'string' && v && v !== k) return v;
  return fallback ?? k;
};

function steepLabel(k: 'S' | 'T' | 'E' | 'ENV' | 'P'): string {
  switch (k) {
    case 'S':
      return t('wizard.steep.dimensions.social', 'Social');
    case 'T':
      return t('wizard.steep.dimensions.technological', 'Technological');
    case 'E':
      return t('wizard.steep.dimensions.economic', 'Economic');
    case 'ENV':
      return t('wizard.steep.dimensions.environmental', 'Environmental');
    case 'P':
      return t('wizard.steep.dimensions.political', 'Political');
  }
}

function impactLabel(level: 'low' | 'medium' | 'high'): string {
  return t(`report.results.impact.${level}`, level);
}

/* ── Section renderers ────────────────────────────────────────────── */

function renderCover(doc: jsPDF, report: ReportResponse, cp: CompanyProfile) {
  paintBackground(doc);

  // Thin gold rule near the top — gives the cover an identity hook
  // without needing a logo asset.
  doc.setDrawColor(ACCENT);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_X, 36, MARGIN_X + 18, 36);

  setText(doc, ACCENT, 8, 'bold');
  doc.text(t('report.eyebrow', 'Strategic foresight report').toUpperCase(), MARGIN_X, 50);

  setText(doc, TEXT, 26, 'bold');
  const titleLines = doc.splitTextToSize(report.title, CONTENT_W) as string[];
  let y = 90;
  for (const ln of titleLines) {
    doc.text(ln, MARGIN_X, y);
    y += 11;
  }

  y += 8;
  const lang = i18n.language?.startsWith('en') ? 'en-GB' : 'es-ES';
  const dateStr = new Date(report.createdAt).toLocaleDateString(lang, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  setText(doc, MUTED, 11, 'normal');
  doc.text(
    t('report.meta.created', 'Created {{date}}').replace('{{date}}', dateStr),
    MARGIN_X,
    y,
  );
  y += 6;

  if (cp.sector) {
    doc.text(cp.sector, MARGIN_X, y);
    y += 6;
  }
  if (cp.horizon) {
    doc.text(
      t('report.meta.horizon', '· Horizon {{value}} years').replace('{{value}}', cp.horizon),
      MARGIN_X,
      y,
    );
    y += 6;
  }

  if (cp.consultantName || cp.consultantCompany) {
    y += 6;
    const consultant = [cp.consultantName, cp.consultantCompany].filter(Boolean).join(' — ');
    setText(doc, SOFT, 10, 'italic');
    doc.text(consultant, MARGIN_X, y);
  }
}

function renderInputs(doc: jsPDF, input: InputData): number {
  let y = addPage(doc);
  const cp = input.companyProfile ?? {};
  const isEn = i18n.language?.startsWith('en');
  y = sectionHeader(doc, y, isEn ? 'Organisation profile' : 'Perfil de la organización');

  if (cp.name) y = labelValue(doc, y, t('report.inputs.organization', 'Organisation'), cp.name);
  if (cp.sector) y = labelValue(doc, y, t('report.inputs.sector', 'Sector'), cp.sector);
  if (cp.horizon) {
    y = labelValue(
      doc,
      y,
      isEn ? 'Horizon' : 'Horizonte',
      `${cp.horizon} ${isEn ? 'years' : 'años'}`,
    );
  }
  if (cp.challenge) y = labelValue(doc, y, t('report.inputs.challenge', 'Strategic challenge'), cp.challenge);
  if (cp.strengths) {
    y = labelValue(
      doc,
      y,
      isEn ? 'Capabilities / strengths' : 'Capacidades / ventajas',
      cp.strengths,
    );
  }
  if (cp.consultantName || cp.consultantCompany) {
    const consultant = [cp.consultantName, cp.consultantCompany].filter(Boolean).join(' — ');
    y = labelValue(doc, y, isEn ? 'Consultant' : 'Consultor', consultant);
  }

  const g = input.globalSteep ?? {};
  const s = input.steep ?? {};
  const dims: Array<'S' | 'T' | 'E' | 'ENV' | 'P'> = ['S', 'T', 'E', 'ENV', 'P'];
  const hasGlobal = dims.some((k) => (g[k] ?? '').trim().length > 0);
  const hasSect = dims.some((k) => (s[k] ?? '').trim().length > 0);

  if (hasGlobal) {
    y += 4;
    y = sectionHeader(
      doc,
      y,
      `${t('report.results.steep.title', 'STEEP analysis')} — ${t('report.results.steep.global', 'Global')}`,
    );
    for (const k of dims) {
      const v = (g[k] ?? '').trim();
      if (v) y = labelValue(doc, y, steepLabel(k), v);
    }
  }

  if (hasSect) {
    y += 4;
    y = sectionHeader(
      doc,
      y,
      `${t('report.results.steep.title', 'STEEP analysis')} — ${t('report.results.steep.sectorial', 'Sectorial')}`,
    );
    for (const k of dims) {
      const v = (s[k] ?? '').trim();
      if (v) y = labelValue(doc, y, steepLabel(k), v);
    }
  }

  return y;
}

function renderExecutiveSummary(doc: jsPDF, exec: string): number {
  let y = addPage(doc);
  y = sectionHeader(doc, y, t('report.results.summary.execTitle', 'Executive summary'));
  return body(doc, y, exec, { color: TEXT, size: 11, leading: 6, trailingGap: 6 });
}

function renderUncertainties(doc: jsPDF, y: number, items: KeyUncertainty[]): number {
  y = checkY(doc, y, 30);
  y = sectionHeader(doc, y, t('report.results.uncertainties', 'Key uncertainties'));
  for (let i = 0; i < items.length; i++) {
    const u = items[i];
    y = checkY(doc, y, 16);
    setText(doc, ACCENT, 9, 'bold');
    const idx = String(i + 1).padStart(2, '0');
    doc.text(idx, MARGIN_X, y);
    setText(doc, TEXT, 11, 'bold');
    const titleLines = doc.splitTextToSize(u.name, CONTENT_W - 12) as string[];
    for (let li = 0; li < titleLines.length; li++) {
      if (li > 0) y = checkY(doc, y, 6);
      doc.text(titleLines[li], MARGIN_X + 12, y);
      y += 5.5;
    }
    if (u.description) {
      y = body(doc, y, u.description, {
        indent: MARGIN_X + 12,
        maxWidth: CONTENT_W - 12,
        trailingGap: 4,
      });
    }
  }
  return y + 2;
}

function renderScenarios(doc: jsPDF, scenarios: Scenario[]): number {
  let y = addPage(doc);
  y = sectionHeader(doc, y, t('report.results.tabs.scenarios', '3P Scenarios'));
  for (const s of scenarios) {
    y = checkY(doc, y, 30);
    // Header row: TYPE + (probability right-aligned)
    setText(doc, ACCENT, 8, 'bold');
    doc.text((s.type ?? '').toUpperCase(), MARGIN_X, y);
    if (s.probability) {
      setText(doc, ACCENT, 8, 'bold');
      const w = doc.getTextWidth(s.probability);
      doc.text(s.probability, PAGE_W - MARGIN_X - w, y);
    }
    y += 5;
    setText(doc, TEXT, 14, 'bold');
    const nameLines = doc.splitTextToSize(s.name ?? s.title ?? '', CONTENT_W) as string[];
    for (const ln of nameLines) {
      y = checkY(doc, y, 7);
      doc.text(ln, MARGIN_X, y);
      y += 6.5;
    }
    y += 1;
    if (s.description) y = body(doc, y, s.description, { color: SOFT, size: 10.5, leading: 5.5, trailingGap: 3 });
    if (s.opportunities?.length) {
      y = subHeader(doc, y, t('report.results.scen.opps', 'Opportunities'));
      y = bullets(doc, y, s.opportunities);
    }
    if (s.threats?.length) {
      y = subHeader(doc, y, t('report.results.scen.threats', 'Threats'));
      y = bullets(doc, y, s.threats);
    }
    if (s.successFactors?.length) {
      y = subHeader(doc, y, t('report.results.scen.success', 'Success factors'));
      y = bullets(doc, y, s.successFactors);
    }
    if (s.firstMove) {
      y = subHeader(doc, y, t('report.results.scen.firstmove', 'First move'));
      y = body(doc, y, s.firstMove, { color: TEXT, trailingGap: 4 });
    }
    y = rule(doc, y + 2);
  }
  return y;
}

function renderScenarioPlanning(doc: jsPDF, sp: ScenarioPlanning): number {
  let y = addPage(doc);
  y = sectionHeader(doc, y, t('report.results.tabs.sp', 'Scenario Planning'));
  if (sp.intro) y = body(doc, y, sp.intro, { color: SOFT, size: 10.5, leading: 5.5, trailingGap: 6 });

  if (sp.drivingForces?.length) {
    y = subHeader(doc, y, t('report.results.sp.forces', 'Driving forces of change'));
    for (const f of sp.drivingForces) y = renderDrivingForce(doc, y, f);
    y += 2;
  }

  if (sp.axes?.length) {
    y = subHeader(doc, y, t('report.results.sp.axesTitle', 'Critical uncertainty axes'));
    for (const a of sp.axes) y = renderAxis(doc, y, a);
    y += 2;
  }

  if (sp.scenarioLogics?.length) {
    y = subHeader(doc, y, t('report.results.sp.logics', 'Narrative logic per scenario'));
    for (const l of sp.scenarioLogics) y = renderScenarioLogic(doc, y, l);
  }
  return y;
}

function renderDrivingForce(doc: jsPDF, y: number, f: DrivingForce): number {
  y = checkY(doc, y, 14);
  const score = Math.max(0, Math.min(100, Math.round(f.impactScore ?? 0)));
  setText(doc, ACCENT, 8, 'bold');
  doc.text(`#${f.rank}`, MARGIN_X, y);
  setText(doc, TEXT, 11, 'bold');
  // Reserve right-side space for the score so the title doesn't overlap it.
  const scoreStr = `${score}%`;
  const scoreW = doc.getTextWidth(scoreStr);
  const titleX = MARGIN_X + 12;
  const titleMaxW = CONTENT_W - 12 - scoreW - 4;
  const titleLines = doc.splitTextToSize(f.title, titleMaxW) as string[];
  doc.text(titleLines[0] ?? '', titleX, y);
  setText(doc, ACCENT, 9, 'bold');
  doc.text(scoreStr, PAGE_W - MARGIN_X - scoreW, y);
  y += 5;
  for (let i = 1; i < titleLines.length; i++) {
    y = checkY(doc, y, 6);
    setText(doc, TEXT, 11, 'bold');
    doc.text(titleLines[i], titleX, y);
    y += 5;
  }
  if (f.description) {
    y = body(doc, y, f.description, {
      indent: titleX,
      maxWidth: CONTENT_W - 12,
      size: 10,
      leading: 5,
      trailingGap: 4,
    });
  }
  return y;
}

function renderAxis(doc: jsPDF, y: number, a: UncertaintyAxis): number {
  y = checkY(doc, y, 18);
  setText(doc, TEXT, 11, 'bold');
  const labelLines = doc.splitTextToSize(a.label, CONTENT_W) as string[];
  for (const ln of labelLines) {
    y = checkY(doc, y, 6);
    doc.text(ln, MARGIN_X, y);
    y += 5.5;
  }
  if (a.poleLow) {
    y = checkY(doc, y, 8);
    setText(doc, ACCENT, 8, 'bold');
    doc.text('−', MARGIN_X, y);
    y = body(doc, y, a.poleLow, { indent: MARGIN_X + 6, maxWidth: CONTENT_W - 6, size: 10, trailingGap: 1 });
  }
  if (a.poleHigh) {
    y = checkY(doc, y, 8);
    setText(doc, ACCENT, 8, 'bold');
    doc.text('+', MARGIN_X, y);
    y = body(doc, y, a.poleHigh, { indent: MARGIN_X + 6, maxWidth: CONTENT_W - 6, size: 10, trailingGap: 1 });
  }
  if (a.rationale) {
    y = body(doc, y, a.rationale, {
      indent: MARGIN_X,
      size: 9.5,
      color: MUTED,
      leading: 4.8,
      trailingGap: 4,
    });
  }
  return y + 1;
}

function renderScenarioLogic(doc: jsPDF, y: number, l: ScenarioLogic): number {
  y = checkY(doc, y, 14);
  setText(doc, TEXT, 11, 'bold');
  doc.text(l.name, MARGIN_X, y);
  y += 5;
  if (l.logic) y = body(doc, y, l.logic, { color: SOFT, size: 10, trailingGap: 4 });
  return y;
}

function renderBackcasting(doc: jsPDF, entries: BackcastingEntry[]): number {
  let y = addPage(doc);
  y = sectionHeader(doc, y, t('report.results.tabs.bc', 'Backcasting'));
  for (const e of entries) {
    y = checkY(doc, y, 24);
    setText(doc, ACCENT, 8, 'bold');
    doc.text((e.scenarioType ?? '').toUpperCase(), MARGIN_X, y);
    y += 5;
    setText(doc, TEXT, 13, 'bold');
    const nameLines = doc.splitTextToSize(e.scenarioName ?? '', CONTENT_W) as string[];
    for (const ln of nameLines) {
      y = checkY(doc, y, 6.5);
      doc.text(ln, MARGIN_X, y);
      y += 6;
    }
    if (e.visionStatement) {
      y = subHeader(doc, y + 1, t('report.results.bc.vision', 'Vision —').replace(/[—–-]\s*$/, '').trim());
      y = body(doc, y, e.visionStatement, { color: TEXT, size: 10.5, trailingGap: 4 });
    }
    if (e.milestones?.length) {
      for (const m of e.milestones) y = renderMilestone(doc, y, m);
    }
    if (e.startingPoint) {
      y = subHeader(doc, y, t('report.results.bc.start', 'Starting point'));
      y = body(doc, y, e.startingPoint, { color: SOFT, trailingGap: 4 });
    }
    y = rule(doc, y + 2);
  }
  return y;
}

function renderMilestone(doc: jsPDF, y: number, m: BackcastingMilestone): number {
  y = checkY(doc, y, 14);
  setText(doc, ACCENT, 9, 'bold');
  doc.text(m.year ?? '', MARGIN_X, y);
  setText(doc, TEXT, 11, 'bold');
  doc.text(m.title ?? '', MARGIN_X + 16, y);
  y += 5;
  if (m.description) {
    y = body(doc, y, m.description, {
      indent: MARGIN_X + 16,
      maxWidth: CONTENT_W - 16,
      size: 10,
      trailingGap: 2,
    });
  }
  if (m.actions?.length) {
    setText(doc, SOFT, 10, 'normal');
    for (const a of m.actions) {
      const lines = doc.splitTextToSize(a, CONTENT_W - 22) as string[];
      for (let i = 0; i < lines.length; i++) {
        y = checkY(doc, y, 5);
        if (i === 0) {
          setText(doc, ACCENT, 10, 'normal');
          doc.text('›', MARGIN_X + 16, y);
          setText(doc, SOFT, 10, 'normal');
          doc.text(lines[i], MARGIN_X + 22, y);
        } else {
          doc.text(lines[i], MARGIN_X + 22, y);
        }
        y += 5;
      }
    }
    y += 1;
  }
  return y + 1;
}

function renderStrategicMap(doc: jsPDF, items: StrategicPriority[]): number {
  let y = addPage(doc);
  y = sectionHeader(doc, y, t('report.results.tabs.str', 'Strategic map'));
  // Group by horizon for consistent on-page ordering.
  const order: Array<'H1' | 'H2' | 'H3'> = ['H1', 'H2', 'H3'];
  for (const h of order) {
    const group = items.filter((it) => it.horizon === h);
    if (group.length === 0) continue;
    y = subHeader(doc, y, t(`report.results.str.${h.toLowerCase()}`, h));
    for (const it of group) y = renderPriority(doc, y, it);
    y += 2;
  }
  return y;
}

function renderPriority(doc: jsPDF, y: number, it: StrategicPriority): number {
  y = checkY(doc, y, 14);
  setText(doc, TEXT, 11, 'bold');
  // Reserve right side for the impact pill.
  const impactStr = impactLabel(it.impact);
  setText(doc, ACCENT, 8, 'bold');
  const impactW = doc.getTextWidth(impactStr.toUpperCase());
  const titleMaxW = CONTENT_W - impactW - 6;
  setText(doc, TEXT, 11, 'bold');
  const titleLines = doc.splitTextToSize(it.title, titleMaxW) as string[];
  doc.text(titleLines[0] ?? '', MARGIN_X, y);
  setText(doc, ACCENT, 8, 'bold');
  doc.text(impactStr.toUpperCase(), PAGE_W - MARGIN_X - impactW, y);
  y += 5;
  for (let i = 1; i < titleLines.length; i++) {
    y = checkY(doc, y, 5.5);
    setText(doc, TEXT, 11, 'bold');
    doc.text(titleLines[i], MARGIN_X, y);
    y += 5;
  }
  if (it.timeframe) {
    setText(doc, MUTED, 9, 'italic');
    y = checkY(doc, y, 5);
    doc.text(it.timeframe, MARGIN_X, y);
    y += 5;
  }
  if (it.actions?.length) y = bullets(doc, y, it.actions);
  return y + 1;
}

function renderSignals(doc: jsPDF, signals: WeakSignal[], wildcards: Wildcard[]): number {
  let y = addPage(doc);
  if (signals.length) {
    y = sectionHeader(doc, y, t('report.results.sig.signals', 'Weak signals'));
    for (const s of signals) y = renderWeakSignal(doc, y, s);
  }
  if (wildcards.length) {
    y = checkY(doc, y + 2, 20);
    y = sectionHeader(doc, y, t('report.results.sig.wildcards', 'Wildcards'));
    for (const w of wildcards) y = renderWildcard(doc, y, w);
  }
  return y;
}

function renderWeakSignal(doc: jsPDF, y: number, s: WeakSignal): number {
  y = checkY(doc, y, 14);
  setText(doc, TEXT, 11, 'bold');
  doc.text(s.title, MARGIN_X, y);
  if (s.dimension) {
    setText(doc, ACCENT, 8, 'normal');
    const w = doc.getTextWidth(s.dimension.toUpperCase());
    doc.text(s.dimension.toUpperCase(), PAGE_W - MARGIN_X - w, y);
  }
  y += 5;
  if (s.description) y = body(doc, y, s.description, { color: SOFT, trailingGap: 4 });
  return y;
}

function renderWildcard(doc: jsPDF, y: number, w: Wildcard): number {
  y = checkY(doc, y, 12);
  setText(doc, ACCENT, 11, 'bold');
  doc.text(w.title, MARGIN_X, y);
  y += 5;
  if (w.description) y = body(doc, y, w.description, { color: SOFT, trailingGap: 4 });
  return y;
}

function renderSources(doc: jsPDF, src: Sources): number {
  let y = addPage(doc);
  y = sectionHeader(doc, y, t('report.results.tabs.sources', 'Sources'));
  setText(doc, SOFT, 10, 'normal');
  y = body(doc, y, t('report.results.sources.intro', ''), { color: MUTED, size: 9.5, leading: 5, trailingGap: 4 });

  if (src.globalSteep?.length) {
    y = subHeader(doc, y, t('report.results.sources.global', 'Global context'));
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
        y = subHeader(doc, y, t(labelKey, key));
        y = renderSourceList(doc, y, list);
      }
    }
  } else if (src.report?.length) {
    y = subHeader(doc, y, t('report.results.sources.report', 'Report'));
    y = renderSourceList(doc, y, src.report);
  } else if (src.sources?.length) {
    y = renderSourceList(doc, y, src.sources);
  }
  return y;
}

function renderSourceList(doc: jsPDF, y: number, list: SourceItem[]): number {
  for (const it of list) {
    y = checkY(doc, y, 12);
    setText(doc, TEXT, 10, 'bold');
    const titleLines = doc.splitTextToSize(it.title || it.url || '—', CONTENT_W) as string[];
    for (const ln of titleLines) {
      y = checkY(doc, y, 5);
      doc.text(ln, MARGIN_X, y);
      y += 5;
    }
    if (it.url) {
      setText(doc, MUTED, 8.5, 'italic');
      const urlLines = doc.splitTextToSize(it.url, CONTENT_W) as string[];
      for (const ln of urlLines) {
        y = checkY(doc, y, 4.5);
        doc.text(ln, MARGIN_X, y);
        y += 4.5;
      }
    }
    if (it.description) {
      y = body(doc, y, it.description, { color: SOFT, size: 9.5, leading: 4.8, trailingGap: 3 });
    } else {
      y += 1;
    }
  }
  return y + 2;
}

/* ── Footer (page numbers) ────────────────────────────────────────── */

function addFooters(doc: jsPDF, reportTitle: string) {
  const total = doc.getNumberOfPages();
  // Cover (page 1) skips the footer for a cleaner title-page look.
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    setText(doc, MUTED, 8, 'normal');
    const titleClip = reportTitle.length > 70 ? reportTitle.slice(0, 67) + '…' : reportTitle;
    doc.text(titleClip, MARGIN_X, PAGE_H - 10);
    const pageStr = `${p} / ${total}`;
    const w = doc.getTextWidth(pageStr);
    doc.text(pageStr, PAGE_W - MARGIN_X - w, PAGE_H - 10);
  }
}

/* ── Entry point ──────────────────────────────────────────────────── */

export function exportReportPdf(report: ReportResponse) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const input = (report.inputData ?? {}) as InputData;
  const result = (report.resultData ?? null) as ResultData | null;
  const cp = input.companyProfile ?? {};

  renderCover(doc, report, cp);
  let y = renderInputs(doc, input);

  if (result) {
    if (result.executiveSummary) {
      y = renderExecutiveSummary(doc, result.executiveSummary);
    }
    if (result.keyUncertainties?.length) {
      y += 6;
      y = renderUncertainties(doc, y, result.keyUncertainties);
    }
    if (result.scenarios?.length) {
      y = renderScenarios(doc, result.scenarios);
    }
    if (
      result.scenarioPlanning &&
      ((result.scenarioPlanning.drivingForces?.length ?? 0) > 0 ||
        (result.scenarioPlanning.axes?.length ?? 0) > 0 ||
        (result.scenarioPlanning.scenarioLogics?.length ?? 0) > 0)
    ) {
      y = renderScenarioPlanning(doc, result.scenarioPlanning);
    }
    if (result.backcasting?.length) {
      y = renderBackcasting(doc, result.backcasting);
    }
    if (result.strategicMap?.length) {
      y = renderStrategicMap(doc, result.strategicMap);
    }
    if ((result.weakSignals?.length ?? 0) > 0 || (result.wildcards?.length ?? 0) > 0) {
      y = renderSignals(doc, result.weakSignals ?? [], result.wildcards ?? []);
    }
    if (
      result.sources &&
      ((result.sources.sources?.length ?? 0) > 0 ||
        (result.sources.report?.length ?? 0) > 0 ||
        (result.sources.globalSteep?.length ?? 0) > 0 ||
        (result.sources.bySection &&
          Object.values(result.sources.bySection).some((v) => (v?.length ?? 0) > 0)))
    ) {
      y = renderSources(doc, result.sources);
    }
  }

  addFooters(doc, report.title);

  const safeName = report.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'report';
  doc.save(`${safeName}_foresight.pdf`);
}
