import jsPDF from 'jspdf';
import type { ReportResponse } from '../types/api';

type ResultData = {
  scenarios?: { type: string; title: string; description: string }[];
  weakSignals?: string[];
  wildcards?: string[];
  keyUncertainties?: string[];
};

type InputData = {
  companyProfile?: { name?: string; sector?: string; horizon?: string; challenge?: string };
  steep?: Record<string, string>;
  horizon?: Record<string, string>;
};

const STEEP_LABELS: Record<string, string> = {
  social: 'Social', technological: 'Tecnológico', economic: 'Económico',
  environmental: 'Ambiental', political: 'Político',
};

const HORIZON_LABELS: Record<string, string> = {
  H1: 'H1 — Corto plazo (0–2 años)',
  H2: 'H2 — Medio plazo (2–5 años)',
  H3: 'H3 — Largo plazo (5+ años)',
};

const ACCENT = '#C9A84C';
const MUTED = '#6b7280';
const TEXT = '#e5e7eb';
const BG = '#0f0f0f';

function addPage(doc: jsPDF) {
  doc.addPage();
  doc.setFillColor(BG);
  doc.rect(0, 0, 210, 297, 'F');
  return 20;
}

function checkY(doc: jsPDF, y: number, needed = 20): number {
  if (y + needed > 277) return addPage(doc);
  return y;
}

function sectionTitle(doc: jsPDF, y: number, text: string): number {
  y = checkY(doc, y, 12);
  doc.setFontSize(7);
  doc.setTextColor(ACCENT);
  doc.setFont('helvetica', 'bold');
  doc.text(text.toUpperCase(), 20, y);
  doc.setDrawColor(ACCENT);
  doc.setLineWidth(0.3);
  doc.line(20, y + 2, 190, y + 2);
  return y + 10;
}

function bodyText(doc: jsPDF, y: number, text: string, indent = 20): number {
  doc.setFontSize(9);
  doc.setTextColor(TEXT);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(text, 170 - (indent - 20)) as string[];
  y = checkY(doc, y, lines.length * 5);
  doc.text(lines, indent, y);
  return y + lines.length * 5 + 2;
}

function labelValue(doc: jsPDF, y: number, label: string, value: string): number {
  y = checkY(doc, y, 14);
  doc.setFontSize(7);
  doc.setTextColor(ACCENT);
  doc.setFont('helvetica', 'bold');
  doc.text(label.toUpperCase(), 20, y);
  y += 5;
  return bodyText(doc, y, value || '—');
}

export function exportReportPdf(report: ReportResponse) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const input = report.inputData as InputData;
  const result = report.resultData as ResultData | null;

  // Cover
  doc.setFillColor(BG);
  doc.rect(0, 0, 210, 297, 'F');

  doc.setFontSize(7);
  doc.setTextColor(ACCENT);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORME DE FORESIGHT ESTRATÉGICO', 20, 80);

  doc.setFontSize(22);
  doc.setTextColor(TEXT);
  doc.setFont('helvetica', 'normal');
  const titleLines = doc.splitTextToSize(report.title, 170) as string[];
  doc.text(titleLines, 20, 95);

  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text(`Creado el ${new Date(report.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}`, 20, 115 + (titleLines.length - 1) * 10);
  if (input?.companyProfile?.sector) {
    doc.text(input.companyProfile.sector, 20, 122 + (titleLines.length - 1) * 10);
  }

  // Inputs page
  let y = addPage(doc);

  y = sectionTitle(doc, y, 'Perfil de la organización');
  if (input?.companyProfile?.name) y = labelValue(doc, y, 'Organización', input.companyProfile.name);
  if (input?.companyProfile?.sector) y = labelValue(doc, y, 'Sector', input.companyProfile.sector);
  if (input?.companyProfile?.horizon) y = labelValue(doc, y, 'Horizonte', `${input.companyProfile.horizon} años`);
  if (input?.companyProfile?.challenge) y = labelValue(doc, y, 'Reto estratégico', input.companyProfile.challenge);

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

  // Results
  if (result) {
    y = addPage(doc);
    y = sectionTitle(doc, y, 'Resultados del análisis IA');

    if (result.scenarios?.length) {
      y += 2;
      y = sectionTitle(doc, y, 'Escenarios 3P');
      for (const s of result.scenarios) {
        y = checkY(doc, y, 20);
        doc.setFontSize(8);
        doc.setTextColor(ACCENT);
        doc.setFont('helvetica', 'bold');
        doc.text(s.type, 20, y);
        y += 5;
        y = bodyText(doc, y, `${s.title} — ${s.description}`);
        y += 2;
      }
    }

    if (result.keyUncertainties?.length) {
      y += 4;
      y = sectionTitle(doc, y, 'Incertidumbres clave');
      for (const u of result.keyUncertainties) y = bodyText(doc, y, `· ${u}`);
    }

    if (result.weakSignals?.length) {
      y += 4;
      y = sectionTitle(doc, y, 'Señales débiles');
      for (const s of result.weakSignals) y = bodyText(doc, y, `· ${s}`);
    }

    if (result.wildcards?.length) {
      y += 4;
      y = sectionTitle(doc, y, 'Wildcards');
      for (const w of result.wildcards) y = bodyText(doc, y, `· ${w}`);
    }
  }

  const filename = `${report.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_foresight.pdf`;
  doc.save(filename);
}
