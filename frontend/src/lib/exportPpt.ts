import PptxGenJS from 'pptxgenjs';
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

const BG = '0f0f0f';
const ACCENT = 'C9A84C';
const TEXT = 'e5e7eb';
const MUTED = '6b7280';

const STEEP_LABELS: Record<string, string> = {
  social: 'Social', technological: 'Tecnológico', economic: 'Económico',
  environmental: 'Ambiental', political: 'Político',
};

const HORIZON_LABELS: Record<string, string> = {
  H1: 'H1 — Corto plazo (0–2 años)',
  H2: 'H2 — Medio plazo (2–5 años)',
  H3: 'H3 — Largo plazo (5+ años)',
};

function addSlide(pptx: PptxGenJS, title: string) {
  const slide = pptx.addSlide();
  slide.background = { color: BG };
  slide.addText(title.toUpperCase(), {
    x: 0.4, y: 0.2, w: '90%', h: 0.35,
    fontSize: 7, color: ACCENT, bold: true, charSpacing: 2,
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 0.4, y: 0.6, w: 9.2, h: 0,
    line: { color: ACCENT, width: 0.5 },
  });
  return slide;
}

function bulletList(slide: ReturnType<PptxGenJS['addSlide']>, items: string[], x: number, y: number, w: number) {
  slide.addText(
    items.map((text) => ({ text: `· ${text}`, options: { bullet: false } })),
    { x, y, w, h: 4, fontSize: 10, color: TEXT, valign: 'top' }
  );
}

export function exportReportPpt(report: ReportResponse) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Foresight';

  const input = report.inputData as InputData;
  const result = report.resultData as ResultData | null;
  const cp = input?.companyProfile;

  // Slide 1 — Cover
  const cover = pptx.addSlide();
  cover.background = { color: BG };
  cover.addText('INFORME DE FORESIGHT ESTRATÉGICO', {
    x: 0.6, y: 1.8, w: '85%', h: 0.4,
    fontSize: 8, color: ACCENT, bold: true, charSpacing: 3,
  });
  cover.addText(report.title, {
    x: 0.6, y: 2.4, w: '85%', h: 1.6,
    fontSize: 28, color: TEXT, bold: false,
  });
  cover.addText(
    `${cp?.name ?? ''}  ·  ${new Date(report.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    { x: 0.6, y: 4.4, w: '85%', h: 0.4, fontSize: 10, color: MUTED }
  );

  // Slide 2 — Perfil
  const profileSlide = addSlide(pptx, 'Perfil de la organización');
  const profileRows = [
    cp?.name && ['Organización', cp.name],
    cp?.sector && ['Sector', cp.sector],
    cp?.horizon && ['Horizonte', `${cp.horizon} años`],
    cp?.challenge && ['Reto estratégico', cp.challenge],
  ].filter(Boolean) as [string, string][];

  profileSlide.addText(
    profileRows.map(([label, value]) => [
      { text: `${label.toUpperCase()}\n`, options: { fontSize: 7, color: ACCENT, bold: true } },
      { text: `${value}\n\n`, options: { fontSize: 11, color: TEXT, bold: false } },
    ]).flat(),
    { x: 0.4, y: 0.8, w: '90%', h: 4.2, valign: 'top' }
  );

  // Slide 3 — STEEP
  if (input?.steep) {
    const entries = Object.entries(input.steep).filter(([, v]) => v);
    if (entries.length) {
      const steepSlide = addSlide(pptx, 'Análisis STEEP');
      const half = Math.ceil(entries.length / 2);
      const left = entries.slice(0, half);
      const right = entries.slice(half);

      const toText = (list: [string, string][]) =>
        list.map(([k, v]) => [
          { text: `${(STEEP_LABELS[k] || k).toUpperCase()}\n`, options: { fontSize: 7, color: ACCENT, bold: true } },
          { text: `${v}\n\n`, options: { fontSize: 10, color: TEXT, bold: false } },
        ]).flat();

      steepSlide.addText(toText(left), { x: 0.4, y: 0.8, w: 4.4, h: 4.2, valign: 'top' });
      if (right.length) steepSlide.addText(toText(right), { x: 5.0, y: 0.8, w: 4.4, h: 4.2, valign: 'top' });
    }
  }

  // Slide 4 — Horizon Scan
  if (input?.horizon) {
    const entries = Object.entries(input.horizon).filter(([, v]) => v);
    if (entries.length) {
      const horizonSlide = addSlide(pptx, 'Horizon Scan');
      horizonSlide.addText(
        entries.map(([k, v]) => [
          { text: `${HORIZON_LABELS[k] || k}\n`, options: { fontSize: 8, color: ACCENT, bold: true } },
          { text: `${v}\n\n`, options: { fontSize: 10, color: TEXT, bold: false } },
        ]).flat(),
        { x: 0.4, y: 0.8, w: '90%', h: 4.2, valign: 'top' }
      );
    }
  }

  // Results slides
  if (result) {
    if (result.scenarios?.length) {
      const scenSlide = addSlide(pptx, 'Escenarios 3P');
      const perCol = Math.ceil(result.scenarios.length / 3);
      result.scenarios.forEach((s, i) => {
        const col = Math.floor(i / perCol);
        const row = i % perCol;
        scenSlide.addText([
          { text: `${s.type}\n`, options: { fontSize: 7, color: ACCENT, bold: true } },
          { text: `${s.title}\n`, options: { fontSize: 11, color: TEXT, bold: true } },
          { text: s.description, options: { fontSize: 9, color: MUTED, bold: false } },
        ], { x: 0.4 + col * 3.2, y: 0.8 + row * 2.2, w: 3.0, h: 2.0, valign: 'top' });
      });
    }

    if (result.keyUncertainties?.length) {
      const uncSlide = addSlide(pptx, 'Incertidumbres clave');
      bulletList(uncSlide, result.keyUncertainties, 0.4, 0.8, 9.2);
    }

    if (result.weakSignals?.length) {
      const wsSlide = addSlide(pptx, 'Señales débiles');
      bulletList(wsSlide, result.weakSignals, 0.4, 0.8, 9.2);
    }

    if (result.wildcards?.length) {
      const wcSlide = addSlide(pptx, 'Wildcards');
      bulletList(wcSlide, result.wildcards, 0.4, 0.8, 9.2);
    }
  }

  const filename = `${report.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_foresight.pptx`;
  pptx.writeFile({ fileName: filename });
}
