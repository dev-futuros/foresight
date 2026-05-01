import jsPDF from 'jspdf';
import type { ReportResponse } from '../types/api';

type ResultData = {
  scenarios?: { type: string; title: string; description: string }[];
  weakSignals?: string[];
  wildcards?: string[];
  keyUncertainties?: string[];
};

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

type InputData = {
  companyProfile?: CompanyProfile;
  steep?: Record<string, string>;
  horizon?: Record<string, string>;
};

const STEEP_LABELS: Record<string, string> = {
  social: 'Social',
  technological: 'Tecnológico',
  economic: 'Económico',
  environmental: 'Ambiental',
  political: 'Político',
};

const SIZE_LABELS: Record<string, string> = {
  startup: 'Startup (<50 empl.)',
  pyme: 'PYME (50–250)',
  mediana: 'Mediana (250–1000)',
  grande: 'Grande (+1000)',
};

const MARKET_LABELS: Record<string, string> = {
  local: 'Local / Nacional',
  european: 'Europeo',
  global: 'Global',
};

const HORIZON_LABELS: Record<string, string> = {
  H1: 'H1 — Corto plazo (0–2 años)',
  H2: 'H2 — Medio plazo (2–5 años)',
  H3: 'H3 — Largo plazo (5+ años)',
};

// Dark theme. Pure white for body text so it stays readable on the black fill —
// the previous `#e5e7eb` was washed out enough that some PDF viewers rendered it
// near-invisible against the very dark background.
const BG = '#0F0F0F';
const TEXT = '#FFFFFF';
const ACCENT = '#C9A84C';
const MUTED = '#9CA3AF';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 20;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const PAGE_BOTTOM = 277;

function paintBackground(doc: jsPDF) {
  doc.setFillColor(BG);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
}

function addPage(doc: jsPDF) {
  doc.addPage();
  paintBackground(doc);
  return 20;
}

function checkY(doc: jsPDF, y: number, needed = 20): number {
  if (y + needed > PAGE_BOTTOM) return addPage(doc);
  return y;
}

function sectionTitle(doc: jsPDF, y: number, text: string): number {
  y = checkY(doc, y, 14);
  doc.setFontSize(8);
  doc.setTextColor(ACCENT);
  doc.setFont('helvetica', 'bold');
  doc.text(text.toUpperCase(), MARGIN_X, y);
  doc.setDrawColor(ACCENT);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X, y + 2, PAGE_W - MARGIN_X, y + 2);
  return y + 10;
}

function bodyText(doc: jsPDF, y: number, text: string, indent = MARGIN_X, maxWidth = CONTENT_W): number {
  doc.setFontSize(10);
  doc.setTextColor(TEXT);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  // Render line by line, paginating if we cross the bottom mid-block.
  for (const line of lines) {
    y = checkY(doc, y, 6);
    doc.text(line, indent, y);
    y += 5;
  }
  return y + 2;
}

function labelValue(doc: jsPDF, y: number, label: string, value: string): number {
  y = checkY(doc, y, 14);
  doc.setFontSize(7);
  doc.setTextColor(ACCENT);
  doc.setFont('helvetica', 'bold');
  doc.text(label.toUpperCase(), MARGIN_X, y);
  y += 5;
  return bodyText(doc, y, value || '—');
}

export function exportReportPdf(report: ReportResponse) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const input = report.inputData as InputData;
  const result = report.resultData as ResultData | null;
  const cp = input?.companyProfile ?? {};

  // ── Cover ────────────────────────────────────────────────────────────────
  paintBackground(doc);

  doc.setFontSize(8);
  doc.setTextColor(ACCENT);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORME DE FORESIGHT ESTRATÉGICO', MARGIN_X, 80);

  doc.setFontSize(24);
  doc.setTextColor(TEXT);
  doc.setFont('helvetica', 'normal');
  const titleLines = doc.splitTextToSize(report.title, CONTENT_W) as string[];
  doc.text(titleLines, MARGIN_X, 95);

  let coverY = 100 + titleLines.length * 10;
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  doc.setFont('helvetica', 'normal');
  const dateStr = new Date(report.createdAt).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  doc.text(`Creado el ${dateStr}`, MARGIN_X, coverY);
  coverY += 6;

  if (cp.sector) {
    doc.text(cp.sector, MARGIN_X, coverY);
    coverY += 6;
  }

  if (cp.consultantName || cp.consultantCompany) {
    coverY += 4;
    const consultant = [cp.consultantName, cp.consultantCompany].filter(Boolean).join(' — ');
    doc.setFont('helvetica', 'italic');
    doc.text(`Por ${consultant}`, MARGIN_X, coverY);
  }

  // ── Inputs page ──────────────────────────────────────────────────────────
  let y = addPage(doc);

  y = sectionTitle(doc, y, 'Perfil de la organización');
  if (cp.name) y = labelValue(doc, y, 'Organización', cp.name);
  if (cp.sector) y = labelValue(doc, y, 'Sector', cp.sector);
  if (cp.size) y = labelValue(doc, y, 'Tamaño', SIZE_LABELS[cp.size] || cp.size);
  if (cp.market) y = labelValue(doc, y, 'Ámbito de mercado', MARKET_LABELS[cp.market] || cp.market);
  if (cp.horizon) y = labelValue(doc, y, 'Horizonte', `${cp.horizon} años`);
  if (cp.challenge) y = labelValue(doc, y, 'Reto estratégico', cp.challenge);
  if (cp.strengths) y = labelValue(doc, y, 'Capacidades / ventajas', cp.strengths);

  if (cp.consultantName || cp.consultantCompany) {
    const consultant = [cp.consultantName, cp.consultantCompany].filter(Boolean).join(' — ');
    y = labelValue(doc, y, 'Consultor', consultant);
  }

  if (input?.steep) {
    y += 4;
    y = sectionTitle(doc, y, 'Análisis STEEP');
    for (const [key, value] of Object.entries(input.steep)) {
      if (value) y = labelValue(doc, y, STEEP_LABELS[key] || key, value);
    }
  }

  if (input?.horizon) {
    y += 4;
    y = sectionTitle(doc, y, 'Horizon Scan');
    for (const [key, value] of Object.entries(input.horizon)) {
      if (value) y = labelValue(doc, y, HORIZON_LABELS[key] || key, value);
    }
  }

  // ── Results ──────────────────────────────────────────────────────────────
  if (result) {
    y = addPage(doc);
    y = sectionTitle(doc, y, 'Resultados del análisis IA');

    if (result.scenarios?.length) {
      y += 2;
      y = sectionTitle(doc, y, 'Escenarios 3P');
      for (const s of result.scenarios) {
        y = checkY(doc, y, 24);
        doc.setFontSize(8);
        doc.setTextColor(ACCENT);
        doc.setFont('helvetica', 'bold');
        doc.text(s.type.toUpperCase(), MARGIN_X, y);
        y += 5;
        doc.setFontSize(11);
        doc.setTextColor(TEXT);
        doc.setFont('helvetica', 'bold');
        const titleLn = doc.splitTextToSize(s.title, CONTENT_W) as string[];
        for (const line of titleLn) {
          y = checkY(doc, y, 6);
          doc.text(line, MARGIN_X, y);
          y += 6;
        }
        y = bodyText(doc, y, s.description);
        y += 2;
      }
    }

    if (result.keyUncertainties?.length) {
      y += 4;
      y = sectionTitle(doc, y, 'Incertidumbres clave');
      for (const u of result.keyUncertainties) y = bodyText(doc, y, `• ${u}`);
    }

    if (result.weakSignals?.length) {
      y += 4;
      y = sectionTitle(doc, y, 'Señales débiles');
      for (const s of result.weakSignals) y = bodyText(doc, y, `• ${s}`);
    }

    if (result.wildcards?.length) {
      y += 4;
      y = sectionTitle(doc, y, 'Wildcards');
      for (const w of result.wildcards) y = bodyText(doc, y, `• ${w}`);
    }
  }

  const filename = `${report.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_foresight.pdf`;
  doc.save(filename);
}
