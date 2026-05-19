import PptxGenJS from 'pptxgenjs';
import type { InputData, ReportResponse, ResultData } from '../types/api';

// Dark theme. The slide background uses `fill` (pptxgenjs v4 honours both `color`
// and `fill`, but `fill` is the canonical name in the schema). Text colours are
// set explicitly on every fragment because pptxgenjs does NOT reliably inherit
// `color` from the outer addText options into individual text-run options — that
// inheritance gap is what produced the "black text on black background" we saw.
const BG = '0F0F0F';
const TEXT = 'FFFFFF';
const ACCENT = 'C9A84C';
const MUTED = '9CA3AF';

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

type Slide = ReturnType<PptxGenJS['addSlide']>;

function newSlide(pptx: PptxGenJS): Slide {
  const slide = pptx.addSlide();
  slide.background = { fill: BG };
  return slide;
}

function addHeader(slide: Slide, title: string) {
  slide.addText(title.toUpperCase(), {
    x: 0.4,
    y: 0.2,
    w: '90%',
    h: 0.35,
    fontSize: 8,
    color: ACCENT,
    bold: true,
    charSpacing: 2,
  });
  slide.addShape('line', {
    x: 0.4,
    y: 0.6,
    w: 9.2,
    h: 0,
    line: { color: ACCENT, width: 0.5 },
  });
}

function addLabelValue(
  slide: Slide,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
) {
  slide.addText(
    [
      {
        text: label.toUpperCase(),
        options: { fontSize: 8, color: ACCENT, bold: true, breakLine: true },
      },
      { text: value, options: { fontSize: 11, color: TEXT, bold: false } },
    ],
    { x, y, w, h: 1.0, valign: 'top' },
  );
}

function bulletList(slide: Slide, items: string[], x: number, y: number, w: number, h: number) {
  // Render each bullet on its own line with explicit color. We avoid the array-of-runs
  // form (which concatenates fragments inline unless every fragment carries
  // `breakLine: true`) and just join with newlines — simpler and bulletproof.
  const text = items.map((item) => `• ${item}`).join('\n');
  slide.addText(text, {
    x,
    y,
    w,
    h,
    fontSize: 11,
    color: TEXT,
    valign: 'top',
    paraSpaceAfter: 6,
  });
}

/** Filter a STEEP / horizon entries pair-list to the rows with non-empty
 *  string values. Type predicate narrows the value side away from
 *  {@code string | undefined} so downstream renderers get the right type. */
function nonEmptyEntries(
  source: Record<string, string | undefined> | undefined,
): [string, string][] {
  if (!source) return [];
  return Object.entries(source).filter(
    (e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0,
  );
}

export function exportReportPpt(report: ReportResponse) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Foresight';

  const input: InputData = report.inputData;
  const result: ResultData | null = report.resultData;
  const cp = input.companyProfile ?? {};

  // ── Cover ────────────────────────────────────────────────────────────────
  const cover = newSlide(pptx);
  cover.addText('INFORME DE FORESIGHT ESTRATÉGICO', {
    x: 0.6,
    y: 1.6,
    w: '85%',
    h: 0.4,
    fontSize: 9,
    color: ACCENT,
    bold: true,
    charSpacing: 3,
  });
  cover.addText(report.title, {
    x: 0.6,
    y: 2.2,
    w: '85%',
    h: 1.6,
    fontSize: 32,
    color: TEXT,
    bold: false,
  });

  const dateStr = new Date(report.createdAt).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const metaLine = [cp.name, cp.sector, dateStr].filter(Boolean).join('  ·  ');
  cover.addText(metaLine, {
    x: 0.6,
    y: 4.2,
    w: '85%',
    h: 0.4,
    fontSize: 11,
    color: MUTED,
  });

  if (cp.consultantName || cp.consultantCompany) {
    const consultant = [cp.consultantName, cp.consultantCompany].filter(Boolean).join(' — ');
    cover.addText(`Por ${consultant}`, {
      x: 0.6,
      y: 4.7,
      w: '85%',
      h: 0.4,
      fontSize: 10,
      color: MUTED,
      italic: true,
    });
  }

  // ── Slide 2 — Profile ───────────────────────────────────────────────────
  const profileSlide = newSlide(pptx);
  addHeader(profileSlide, 'Perfil de la organización');

  const profileRows: [string, string][] = [];
  if (cp.name) profileRows.push(['Organización', cp.name]);
  if (cp.sector) profileRows.push(['Sector', cp.sector]);
  if (cp.size) profileRows.push(['Tamaño', SIZE_LABELS[cp.size] || cp.size]);
  if (cp.market) profileRows.push(['Ámbito', MARKET_LABELS[cp.market] || cp.market]);
  if (cp.horizon) profileRows.push(['Horizonte', `${cp.horizon} años`]);
  if (cp.challenge) profileRows.push(['Reto estratégico', cp.challenge]);
  if (cp.strengths) profileRows.push(['Capacidades / ventajas', cp.strengths]);

  // Two columns, fields flow column-major.
  const half = Math.ceil(profileRows.length / 2);
  const leftRows = profileRows.slice(0, half);
  const rightRows = profileRows.slice(half);

  const renderColumn = (rows: [string, string][], x: number, w: number) => {
    let y = 0.9;
    rows.forEach(([label, value]) => {
      addLabelValue(profileSlide, label, value, x, y, w);
      // Estimate height: ~0.35 for label + ~0.05 per word of value (rough).
      const valueLines = Math.max(1, Math.ceil(value.length / 60));
      y += 0.45 + valueLines * 0.22;
    });
  };
  renderColumn(leftRows, 0.4, 4.4);
  if (rightRows.length) renderColumn(rightRows, 5.0, 4.4);

  // Consultant footer on the profile slide
  if (cp.consultantName || cp.consultantCompany) {
    const consultant = [cp.consultantName, cp.consultantCompany].filter(Boolean).join(' — ');
    profileSlide.addText(`Consultor: ${consultant}`, {
      x: 0.4,
      y: 5.2,
      w: '90%',
      h: 0.3,
      fontSize: 9,
      color: MUTED,
      italic: true,
    });
  }

  // ── Slide 3 — STEEP ─────────────────────────────────────────────────────
  const steepEntries = nonEmptyEntries(input.steep);
  if (steepEntries.length) {
    const steepSlide = newSlide(pptx);
    addHeader(steepSlide, 'Análisis STEEP');

    const halfS = Math.ceil(steepEntries.length / 2);
    const leftS = steepEntries.slice(0, halfS);
    const rightS = steepEntries.slice(halfS);

    const renderSteepCol = (list: [string, string][], x: number, w: number) => {
      let y = 0.9;
      list.forEach(([k, v]) => {
        steepSlide.addText(
          [
            {
              text: (STEEP_LABELS[k] || k).toUpperCase(),
              options: { fontSize: 8, color: ACCENT, bold: true, breakLine: true },
            },
            { text: v, options: { fontSize: 10, color: TEXT, bold: false } },
          ],
          { x, y, w, h: 1.6, valign: 'top' },
        );
        const lines = Math.max(2, Math.ceil(v.length / 55));
        y += 0.35 + lines * 0.22;
      });
    };
    renderSteepCol(leftS, 0.4, 4.4);
    if (rightS.length) renderSteepCol(rightS, 5.0, 4.4);
  }

  // ── Slide 4 — Horizon Scan ──────────────────────────────────────────────
  const horizonEntries = nonEmptyEntries(input.horizon);
  if (horizonEntries.length) {
    const horizonSlide = newSlide(pptx);
    addHeader(horizonSlide, 'Horizon Scan');

    let y = 0.9;
    horizonEntries.forEach(([k, v]) => {
      horizonSlide.addText(
        [
          {
            text: HORIZON_LABELS[k] || k,
            options: { fontSize: 10, color: ACCENT, bold: true, breakLine: true },
          },
          { text: v, options: { fontSize: 10, color: TEXT, bold: false } },
        ],
        { x: 0.4, y, w: 9.2, h: 1.4, valign: 'top' },
      );
      const lines = Math.max(2, Math.ceil(v.length / 110));
      y += 0.35 + lines * 0.22;
    });
  }

  // ── Results ─────────────────────────────────────────────────────────────
  if (result) {
    if (result.scenarios?.length) {
      const scenSlide = newSlide(pptx);
      addHeader(scenSlide, 'Escenarios 3P');

      const colW = 3.0;
      result.scenarios.forEach((s, i) => {
        // Scenario evocative names live on `name` in the canonical schema;
        // legacy reports stored them as `title`. Fall back through both
        // so older exports still render a heading.
        const heading = s.name ?? s.title ?? '';
        const x = 0.4 + i * (colW + 0.15);
        scenSlide.addText(
          [
            {
              text: s.type.toUpperCase(),
              options: { fontSize: 8, color: ACCENT, bold: true, breakLine: true },
            },
            { text: heading, options: { fontSize: 12, color: TEXT, bold: true, breakLine: true } },
            { text: '\n', options: { fontSize: 6, color: TEXT } },
            { text: s.description, options: { fontSize: 10, color: MUTED, bold: false } },
          ],
          { x, y: 0.9, w: colW, h: 4.0, valign: 'top' },
        );
      });
    }

    // Bullet sections — each item is a typed object on the canonical
    // schema, so we project to the bullet label here rather than
    // assuming the renderer can stringify an object. keyUncertainties
    // exposes a `name`; weakSignals / wildcards expose a `title`.
    if (result.keyUncertainties?.length) {
      const slide = newSlide(pptx);
      addHeader(slide, 'Incertidumbres clave');
      bulletList(
        slide,
        result.keyUncertainties.map((u) => u.name),
        0.4,
        0.9,
        9.2,
        4.5,
      );
    }

    if (result.weakSignals?.length) {
      const slide = newSlide(pptx);
      addHeader(slide, 'Señales débiles');
      bulletList(
        slide,
        result.weakSignals.map((s) => s.title),
        0.4,
        0.9,
        9.2,
        4.5,
      );
    }

    if (result.wildcards?.length) {
      const slide = newSlide(pptx);
      addHeader(slide, 'Wildcards');
      bulletList(
        slide,
        result.wildcards.map((w) => w.title),
        0.4,
        0.9,
        9.2,
        4.5,
      );
    }
  }

  const filename = `${report.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_foresight.pptx`;
  pptx.writeFile({ fileName: filename });
}
