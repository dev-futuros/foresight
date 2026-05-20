import type { LanguageCode } from '../../../i18n/languages';
import type {
  Backcasting,
  GlobalSteep,
  InputData,
  KeyUncertainty,
  ReportResponse,
  ResultData,
  Scenario,
  SourceItem,
  Sources,
  StrategicMap,
  StrategicPriority,
  WeakSignal,
  Wildcard,
} from '../../../types/api';

/**
 * The render-ready shape the {@code pages.ts} templater consumes.
 *
 * <p>Output of {@code projectReport}: every field is a string or
 * primitive ready to inject into HTML, ALREADY budget-tightened where
 * applicable. The renderer never re-normalises STEEP keys, never
 * re-orders scenarios, never decides what "probable" looks like — all
 * of that is the projection's job. Keeps the templater focused on
 * layout, not data wrangling.
 */
export interface RenderInput {
  /** Effective language for chrome strings + AI tighten calls. */
  language: LanguageCode;
  /** Report title and stable id. */
  title: string;
  reportId: string;
  /** ISO timestamp for the cover date. */
  createdAt: string;
  /** Number of analysis years; defaults to 5. */
  horizonYears: number;

  // Brief / metadata
  orgName: string;
  sector: string;
  challenge: string;
  capabilities: string;
  consultant: string;

  // Executive
  execDeck: string;
  execHeadlineStats: { value: string; label: string; accent: 'gold' | 'teal' | 'blue' }[];
  execParagraphs: string[];

  // STEEP
  steepDimensions: SteepRow[];

  // Uncertainties
  uncertainties: { title: string; body: string }[];

  // Scenarios
  scenariosDeck: string;
  scenarios: ScenarioRow[];

  // Backcasting
  backcastingStartingPoint: string;
  backcastingStartingYear: string;
  backcastingMatrix: BackcastingMatrix;

  // Strategic map
  strategicMap: { h1: StrategicRow; h2: StrategicRow; h3: StrategicRow };

  // Signals + wildcards
  signals: SignalRow[];
  wildcards: { title: string; body: string }[];

  // Bibliography
  biblioSections: { title: string; items: { title: string; url: string }[] }[];
  totalSources: number;

  // Section presence — used to suppress empty pages.
  has: {
    brief: boolean;
    steep: boolean;
    uncertainties: boolean;
    scenarios: boolean;
    backcasting: boolean;
    strategicMap: boolean;
    signals: boolean;
    sources: boolean;
  };
}

export type SteepDimKey = 'S' | 'T' | 'E' | 'ENV' | 'P';

export interface SteepRow {
  key: SteepDimKey;
  label: string;
  global: string;
  sectorial: string;
}

export type ScenarioBand = 'probable' | 'plausible' | 'possible';

export interface ScenarioRow {
  index: number; // 1, 2, 3
  band: ScenarioBand;
  /** Localised band label as it should appear in the tag chip and TOC mono row. */
  bandLabel: string;
  /** Probability percentage as an integer in [0, 100]. */
  probabilityPct: number;
  title: string;
  /** Two-line break-friendly variant for the scenario detail page. */
  titleBroken: string;
  deck: string;
  paragraphs: string[];
  opportunities: string[];
  threats: string[];
  successFactors: string[];
  firstMove: string;
  /** Caption used in the TOC and 3P index rows. */
  caption: string;
}

export interface BackcastingMatrix {
  /** Three years in display order (latest → oldest), e.g. [2031, 2029, 2028]. */
  years: string[];
  /** rows[yearIdx][band] = cell content. */
  rows: { year: string; probable: BackcastingCell; plausible: BackcastingCell; possible: BackcastingCell }[];
  /** Column heads: { band, label } — label includes the scenario name. */
  columnHeads: { band: ScenarioBand; label: string }[];
}

export interface BackcastingCell {
  title: string;
  body: string;
}

export interface StrategicRow {
  cards: StrategicCard[];
}

export interface StrategicCard {
  /** Either "0–18 MESOS" / "18 MESOS–3 ANYS" / "3–5 ANYS" — pre-localised. */
  window: string;
  /** Priority tag class — drives the chip color. */
  priority: 'alt' | 'mitja' | 'baix';
  /** Pre-localised priority label (ALT / MITJÀ / BAIX). */
  priorityLabel: string;
  title: string;
  bullets: string[];
}

export interface SignalRow {
  dim: SteepDimKey;
  /** Pre-localised dimension label. */
  dimLabel: string;
  title: string;
  body: string;
}

// ── Helpers ──────────────────────────────────────────────────────

/** Coerce a STEEP block (which can arrive with uppercase codes OR
 *  lowercase localised names depending on which wizard step wrote it)
 *  into the canonical {@code SteepBlock} shape. */
function normalizeSteep(s: Record<string, string | undefined> | undefined): Partial<GlobalSteep> {
  if (!s) return {};
  const src = s as Record<string, string | undefined>;
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = src[k];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    return undefined;
  };
  const out: Partial<GlobalSteep> = {};
  const S = pick('S', 'social', 'Social');
  const T = pick('T', 'technological', 'Technological', 'tecnológico', 'tecnologico', 'tecnològic');
  const E = pick('E', 'economic', 'Economic', 'económico', 'economico', 'econòmic');
  const ENV = pick('ENV', 'environmental', 'Environmental', 'medioambiental', 'mediambiental');
  const P = pick('P', 'political', 'Political', 'político', 'politico', 'polític');
  if (S) out.S = S;
  if (T) out.T = T;
  if (E) out.E = E;
  if (ENV) out.ENV = ENV;
  if (P) out.P = P;
  return out;
}

/** Map a scenario's localised "type" to its band. Tolerates ca / es /
 *  en variants (Probable / Plausible / Possible / Posible). */
function bandFromType(type: string | undefined): ScenarioBand {
  const t = (type ?? '').toLowerCase();
  if (t.startsWith('probab')) return 'probable';
  if (t.startsWith('plausib')) return 'plausible';
  if (t.startsWith('pos')) return 'possible'; // 'possible' or 'posible'
  return 'probable';
}

function bandLabelFor(band: ScenarioBand, language: LanguageCode): string {
  if (language === 'en') {
    return band === 'probable' ? 'PROBABLE' : band === 'plausible' ? 'PLAUSIBLE' : 'POSSIBLE';
  }
  if (language === 'ca') {
    return band === 'probable' ? 'PROBABLE' : band === 'plausible' ? 'PLAUSIBLE' : 'POSSIBLE';
  }
  return band === 'probable' ? 'PROBABLE' : band === 'plausible' ? 'PLAUSIBLE' : 'POSIBLE';
}

function steepLabelFor(key: SteepDimKey, language: LanguageCode): string {
  const isEn = language === 'en';
  const isCa = language === 'ca';
  switch (key) {
    case 'S':
      return 'Social';
    case 'T':
      return isEn ? 'Technological' : isCa ? 'Tecnològic' : 'Tecnológico';
    case 'E':
      return isEn ? 'Economic' : isCa ? 'Econòmic' : 'Económico';
    case 'ENV':
      return isEn ? 'Environmental' : isCa ? 'Mediambiental' : 'Medioambiental';
    case 'P':
      return isEn ? 'Political' : isCa ? 'Polític' : 'Político';
  }
}

function priorityLabelFor(
  impact: 'low' | 'medium' | 'high' | undefined,
  language: LanguageCode,
): { cls: 'alt' | 'mitja' | 'baix'; label: string } {
  const i = impact ?? 'medium';
  if (i === 'high') {
    return { cls: 'alt', label: language === 'en' ? 'HIGH' : language === 'ca' ? 'ALT' : 'ALTA' };
  }
  if (i === 'low') {
    return { cls: 'baix', label: language === 'en' ? 'LOW' : language === 'ca' ? 'BAIX' : 'BAJA' };
  }
  return { cls: 'mitja', label: language === 'en' ? 'MEDIUM' : language === 'ca' ? 'MITJÀ' : 'MEDIA' };
}

/** Compact a scenario H1 into two visual lines for the detail page —
 *  inserts a `<br>` near the midpoint at the closest space. Caller is
 *  responsible for trusting this string into innerHTML; the title is
 *  HTML-escaped before this is called so the inserted br is safe. */
function breakTitleAtMidpoint(title: string): string {
  if (title.length < 32) return title; // short titles render fine on one line
  const mid = Math.floor(title.length / 2);
  // Find the closest space to the midpoint in either direction.
  let best = -1;
  for (let radius = 0; radius < title.length; radius++) {
    const a = mid - radius;
    const b = mid + radius;
    if (a > 0 && title[a] === ' ') {
      best = a;
      break;
    }
    if (b < title.length && title[b] === ' ') {
      best = b;
      break;
    }
  }
  if (best <= 0) return title;
  return title.slice(0, best) + '<br>' + title.slice(best + 1);
}

function parsePercent(s: string | undefined): number {
  if (!s) return 0;
  const m = /(\d{1,3})/.exec(s);
  if (!m) return 0;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function safeArray<T>(v: T[] | undefined | null): T[] {
  return Array.isArray(v) ? v : [];
}

function pickCaption(
  scenario: Scenario,
  language: LanguageCode,
): string {
  // Use the first sentence of the description as a caption, capped at
  // the budget per §10. The budget enforcement happens in the tighten
  // pass; here we just take a clean slice.
  const desc = scenario.description ?? '';
  const firstSentence = desc.split(/(?<=[.!?])\s+/)[0] ?? desc;
  if (firstSentence.length > 0) return firstSentence;
  // Language-specific fallback if no description provided.
  return language === 'en'
    ? 'Scenario summary not provided.'
    : language === 'ca'
      ? "Resum d'escenari no disponible."
      : 'Resumen del escenario no disponible.';
}

// ── The projector ────────────────────────────────────────────────

export interface ProjectOptions {
  language: LanguageCode;
  /** Localised priority window labels per horizon. */
  windowLabels?: { h1?: string; h2?: string; h3?: string };
}

/** Project a {@link ReportResponse} into the render-ready
 *  {@link RenderInput}. PURE function — no IO, no AI. The tighten
 *  pre-pass runs AFTER this so it sees the projected (and already
 *  language-localised) strings. */
export function projectReport(
  report: ReportResponse,
  opts: ProjectOptions,
): RenderInput {
  const language = opts.language;
  const input: InputData = report.inputData;
  const result: ResultData | null = report.resultData;
  const cp = input.companyProfile ?? {};

  // ── Brief / executive ─────────────────────────────────────────
  const orgName = cp.name ?? '';
  const sector = cp.sector ?? '';
  const challenge = cp.challenge ?? '';
  const capabilities = cp.strengths ?? '';
  const consultant = [cp.consultantName, cp.consultantCompany].filter(Boolean).join(' — ');
  const horizonYears = Number.parseInt(cp.horizon ?? '5', 10) || 5;

  // Take the executive summary's first short sentence as the deck if
  // it exists; otherwise leave blank and the page-level renderer will
  // skip the slot. AI tighten can refine the deck later if needed.
  const execSummary = result?.executiveSummary ?? '';
  const firstPara = execSummary.split(/\n\n+/)[0] ?? '';
  const firstSentence = firstPara.split(/(?<=[.!?])\s+/)[0] ?? '';

  const execParagraphs = execSummary
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .slice(0, 3);

  // ── STEEP ─────────────────────────────────────────────────────
  const global = normalizeSteep(input.globalSteep);
  const sectorial = normalizeSteep(input.steep);
  const steepDimensions: SteepRow[] = (['S', 'T', 'E', 'ENV', 'P'] as SteepDimKey[]).map((k) => ({
    key: k,
    label: steepLabelFor(k, language),
    global: (global[k] ?? '').trim(),
    sectorial: (sectorial[k] ?? '').trim(),
  }));

  // ── Uncertainties ─────────────────────────────────────────────
  const uncertainties: { title: string; body: string }[] = safeArray<KeyUncertainty>(
    result?.keyUncertainties,
  )
    .slice(0, 4)
    .map((u) => ({
      title: (u.name ?? '').trim(),
      body: (u.description ?? '').trim(),
    }));

  // ── Scenarios ─────────────────────────────────────────────────
  const rawScenarios = safeArray<Scenario>(result?.scenarios).slice(0, 3);
  // Order by descending probability so the layout reads probable → possible.
  const ordered = [...rawScenarios].sort(
    (a, b) => parsePercent(b.probability) - parsePercent(a.probability),
  );
  const scenarios: ScenarioRow[] = ordered.map((s, i) => {
    const band = bandFromType(s.type);
    const title = (s.name ?? s.title ?? '').trim();
    return {
      index: i + 1,
      band,
      bandLabel: bandLabelFor(band, language),
      probabilityPct: parsePercent(s.probability),
      title,
      titleBroken: breakTitleAtMidpoint(title),
      deck: '', // populated below if we infer one
      paragraphs: (s.description ?? '')
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .slice(0, 2),
      opportunities: safeArray<string>(s.opportunities).slice(0, 3),
      threats: safeArray<string>(s.threats).slice(0, 3),
      successFactors: safeArray<string>(s.successFactors).slice(0, 3),
      firstMove: (s.firstMove ?? '').trim(),
      caption: pickCaption(s, language),
    };
  });
  // Deck: first sentence of first paragraph; trim later by tighten if needed.
  for (const sc of scenarios) {
    sc.deck = sc.paragraphs[0]?.split(/(?<=[.!?])\s+/)[0] ?? '';
  }

  // Build the scenarios index deck (used on the 3P index page).
  const scenariosDeck =
    language === 'en'
      ? 'Three scenarios that frame the strategic landscape: the most-likely trajectory, a plausible alternative, and a low-probability disruption.'
      : language === 'ca'
        ? 'Tres escenaris que emmarquen el panorama estratègic: la trajectòria més probable, una alternativa plausible i una disrupció de baixa probabilitat.'
        : 'Tres escenarios que enmarcan el panorama estratégico: la trayectoria más probable, una alternativa plausible y una disrupción de baja probabilidad.';

  // ── Backcasting ───────────────────────────────────────────────
  const bc = safeArray<Backcasting[number]>(result?.backcasting);
  // Collect all milestone years across entries; we want the matrix to
  // show the THREE most-distant horizons in reverse-chrono order.
  const yearSet = new Set<string>();
  for (const e of bc) {
    for (const m of safeArray(e.milestones)) {
      if (m.year) yearSet.add(m.year);
    }
  }
  const years = Array.from(yearSet).sort().reverse().slice(0, 3);
  // Index milestones by (year, band) for quick lookup.
  const cellByYearBand = new Map<string, BackcastingCell>();
  for (const e of bc) {
    const band = bandFromType(e.scenarioType);
    for (const m of safeArray(e.milestones)) {
      const key = `${m.year}__${band}`;
      if (!cellByYearBand.has(key)) {
        cellByYearBand.set(key, {
          title: (m.title ?? '').trim(),
          body: (m.description ?? '').trim(),
        });
      }
    }
  }
  const empty: BackcastingCell = { title: '', body: '' };
  const matrixRows = years.map((year) => ({
    year,
    probable: cellByYearBand.get(`${year}__probable`) ?? empty,
    plausible: cellByYearBand.get(`${year}__plausible`) ?? empty,
    possible: cellByYearBand.get(`${year}__possible`) ?? empty,
  }));
  // Column heads: scenario band + the matching evocative name from the
  // scenarios result (which the analysis pipeline already patched in).
  const nameByBand = new Map<ScenarioBand, string>();
  for (const sc of scenarios) nameByBand.set(sc.band, sc.title);
  const columnHeads: { band: ScenarioBand; label: string }[] = (
    ['probable', 'plausible', 'possible'] as ScenarioBand[]
  ).map((band) => ({
    band,
    label: `${bandLabelFor(band, language)} · ${nameByBand.get(band) ?? ''}`.trim(),
  }));
  // Starting-point — usually carried as the first entry's `startingPoint` field.
  const startingPoint = (bc[0]?.startingPoint ?? '').trim();
  const startingYear = String(new Date(report.createdAt).getFullYear());

  // ── Strategic map ─────────────────────────────────────────────
  const sm: StrategicMap = safeArray<StrategicPriority>(result?.strategicMap);
  const byHorizon: Record<'H1' | 'H2' | 'H3', StrategicPriority[]> = { H1: [], H2: [], H3: [] };
  for (const p of sm) {
    const h = (p.horizon ?? 'H1').toUpperCase() as 'H1' | 'H2' | 'H3';
    if (h === 'H1' || h === 'H2' || h === 'H3') byHorizon[h].push(p);
  }
  const windowDefaults =
    language === 'en'
      ? { h1: '0–18 MONTHS', h2: '18 MONTHS–3 YEARS', h3: '3–5 YEARS' }
      : language === 'ca'
        ? { h1: '0–18 MESOS', h2: '18 MESOS–3 ANYS', h3: '3–5 ANYS' }
        : { h1: '0–18 MESES', h2: '18 MESES–3 AÑOS', h3: '3–5 AÑOS' };
  const renderHorizon = (
    rows: StrategicPriority[],
    fallbackWindow: string,
  ): StrategicRow => ({
    cards: rows.slice(0, 2).map((p) => {
      const pri = priorityLabelFor(p.impact, language);
      return {
        window: (p.timeframe ?? fallbackWindow).toUpperCase(),
        priority: pri.cls,
        priorityLabel: pri.label,
        title: (p.title ?? '').trim(),
        bullets: safeArray<string>(p.actions).slice(0, 3),
      };
    }),
  });
  const strategicMap = {
    h1: renderHorizon(byHorizon.H1, windowDefaults.h1),
    h2: renderHorizon(byHorizon.H2, windowDefaults.h2),
    h3: renderHorizon(byHorizon.H3, windowDefaults.h3),
  };

  // ── Signals + wildcards ───────────────────────────────────────
  // We have 5 STEEP dimensions; one signal per dimension is the
  // canonical layout. If WeakSignal has a `dimension` field, group by
  // it; otherwise distribute in order.
  const rawSignals = safeArray<WeakSignal>(result?.weakSignals).slice(0, 5);
  function dimOf(s: WeakSignal): SteepDimKey {
    const d = (s.dimension ?? '').toLowerCase();
    if (d.startsWith('s')) return 'S';
    if (d.startsWith('te') || d === 't') return 'T';
    if (d.startsWith('ec') || d === 'e') return 'E';
    if (d.startsWith('en') || d.startsWith('med')) return 'ENV';
    if (d.startsWith('p')) return 'P';
    return 'S';
  }
  const signals: SignalRow[] = rawSignals.map((s) => {
    const dim = dimOf(s);
    return {
      dim,
      dimLabel: steepLabelFor(dim, language).toUpperCase(),
      title: (s.title ?? '').trim(),
      body: (s.description ?? '').trim(),
    };
  });
  const wildcards = safeArray<Wildcard>(result?.wildcards)
    .slice(0, 3)
    .map((w) => ({ title: (w.title ?? '').trim(), body: (w.description ?? '').trim() }));

  // ── Bibliography ──────────────────────────────────────────────
  const sources: Sources | undefined = result?.sources;
  const biblioSections: { title: string; items: { title: string; url: string }[] }[] = [];
  const mapItem = (i: SourceItem) => ({ title: i.title || i.url || '—', url: i.url ?? '' });
  if (sources?.globalSteep?.length) {
    biblioSections.push({
      title:
        language === 'en'
          ? 'Global context'
          : language === 'ca'
            ? 'Context global'
            : 'Contexto global',
      items: sources.globalSteep.map(mapItem),
    });
  }
  if (sources?.bySection) {
    const order: ('A' | 'B' | 'C' | 'D' | 'E')[] = ['A', 'B', 'C', 'D', 'E'];
    const sectionLabel = (k: 'A' | 'B' | 'C' | 'D' | 'E'): string => {
      if (language === 'en') {
        return (
          { A: 'Section A · Executive summary', B: 'Section B · Scenarios', C: 'Section C · Planning', D: 'Section D · Strategic map', E: 'Section E · Backcasting' } as const
        )[k];
      }
      if (language === 'ca') {
        return (
          { A: 'Secció A · Resum executiu', B: 'Secció B · Escenaris', C: 'Secció C · Planificació', D: 'Secció D · Mapa estratègic', E: 'Secció E · Backcasting' } as const
        )[k];
      }
      return (
        { A: 'Sección A · Resumen ejecutivo', B: 'Sección B · Escenarios', C: 'Sección C · Planificación', D: 'Sección D · Mapa estratégico', E: 'Sección E · Backcasting' } as const
      )[k];
    };
    for (const k of order) {
      const list = sources.bySection[k];
      if (list && list.length > 0) {
        biblioSections.push({ title: sectionLabel(k), items: list.map(mapItem) });
      }
    }
  } else if (sources?.report?.length) {
    biblioSections.push({
      title:
        language === 'en'
          ? 'Report citations'
          : language === 'ca'
            ? 'Citacions del report'
            : 'Citaciones del informe',
      items: sources.report.map(mapItem),
    });
  } else if (sources?.sources?.length) {
    biblioSections.push({
      title:
        language === 'en'
          ? 'Sources'
          : language === 'ca'
            ? 'Fonts'
            : 'Fuentes',
      items: sources.sources.map(mapItem),
    });
  }
  const totalSources = biblioSections.reduce((acc, s) => acc + s.items.length, 0);

  // ── Section presence ──────────────────────────────────────────
  const has = {
    brief: !!(orgName || sector || challenge || capabilities || execSummary),
    steep: steepDimensions.some((r) => r.global || r.sectorial),
    uncertainties: uncertainties.some((u) => u.title || u.body),
    scenarios: scenarios.length > 0,
    backcasting: matrixRows.length > 0 && matrixRows.some((r) => r.probable.title || r.plausible.title || r.possible.title),
    strategicMap:
      strategicMap.h1.cards.length > 0 ||
      strategicMap.h2.cards.length > 0 ||
      strategicMap.h3.cards.length > 0,
    signals: signals.length > 0 || wildcards.length > 0,
    sources: totalSources > 0,
  };

  // Note: execHeadlineStats is left empty — the canonical ResultData
  // doesn't carry stat callouts and the renderer suppresses the strip
  // when empty. Future analyses can populate this slot.
  return {
    language,
    title: report.title,
    reportId: report.id,
    createdAt: report.createdAt,
    horizonYears,
    orgName,
    sector,
    challenge,
    capabilities,
    consultant,
    execDeck: firstSentence,
    execHeadlineStats: [],
    execParagraphs,
    steepDimensions,
    uncertainties,
    scenariosDeck,
    scenarios,
    backcastingStartingPoint: startingPoint,
    backcastingStartingYear: startingYear,
    backcastingMatrix: { years, rows: matrixRows, columnHeads },
    strategicMap,
    signals,
    wildcards,
    biblioSections,
    totalSources,
    has,
  };
}
