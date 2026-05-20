import { compactUrl, escapeHtml } from './escape';
import type { LabelTable } from './labels';
import type {
  BackcastingMatrix,
  RenderInput,
  ScenarioBand,
  ScenarioRow,
  SignalRow,
  SteepDimKey,
  SteepRow,
  StrategicCard,
  StrategicRow,
} from './project';

/**
 * Per-archetype HTML renderers for the Verdalia foresight report.
 *
 * <p>Each function takes the projected {@link RenderInput} plus the
 * resolved {@link LabelTable} (for chrome strings in the report's
 * language) and a {@link PageMeta} carrying the running-head text and
 * the current page number / total. Renderers return a complete
 * {@code <section class="page">…</section>} string ready to concatenate
 * into the document body.
 *
 * <p>HTML escaping is the renderer's responsibility — every dynamic
 * text value goes through {@link escapeHtml} before injection. Static
 * structural markup is hand-authored and trusted.
 */
export interface PageMeta {
  /** Page number shown in the footer chip (`{n} / {total}`). */
  pageNumber: number;
  /** Total pages — assigned by the template assembler once the full
   *  page list is known. */
  totalPages: number;
  /** Text in the runhead's right slot — typically `{org} — Foresight
   *  {year}`. Already escaped at assembly time. */
  runheadRight: string;
}

function runhead(L: LabelTable, meta: PageMeta): string {
  return `
  <div class="runhead">
    <span class="mono left">${escapeHtml(L.brand)}</span>
    <span class="right">${meta.runheadRight}</span>
  </div>`;
}

function footer(L: LabelTable, meta: PageMeta): string {
  return `
  <div class="footer">
    <span class="left">${escapeHtml(L.brand)}</span>
    <span class="right">${meta.pageNumber} / ${meta.totalPages}</span>
  </div>`;
}

function marginalia(text: string): string {
  return `<div class="marginalia">${escapeHtml(text)}</div>`;
}

// ── Cover ────────────────────────────────────────────────────────

export function renderCover(input: RenderInput, L: LabelTable): string {
  const dateStr = L.date(input.createdAt);
  const eyebrow = `${L.coverEyebrow} · ${input.horizonYears}-${input.language === 'en' ? 'YEAR HORIZON' : input.language === 'ca' ? "ANYS D'HORITZÓ" : 'AÑOS DE HORIZONTE'}`;
  const titleLine = `${input.orgName} —`;
  const subTitle = `Foresight ${new Date(input.createdAt).getFullYear()}`;
  return `
<section class="page cover">
  <div style="padding-top:22mm;">
    <div class="mono accent-gold" style="font-size:10pt; letter-spacing:0.12em;">${escapeHtml(L.brand)}</div>
    <div class="mono" style="color:var(--text-dim); font-size:8.5pt; margin-top:2pt;">${escapeHtml(L.foresight)}</div>
    <hr class="gold-divider" style="margin:10pt 0 6pt 0;">
    <div style="display:flex; justify-content:space-between; align-items:baseline;">
      <span class="mono" style="color:var(--text-dim);">&nbsp;</span>
      <span class="mono" style="color:var(--text-dim);">${escapeHtml(dateStr)}</span>
    </div>
    <div style="text-align:right;" class="mono accent-gold">${escapeHtml(input.sector.toUpperCase())}</div>
  </div>

  <div style="margin-top:36mm;">
    <div class="mono" style="color:var(--text-dim); margin-bottom:14pt;">${escapeHtml(eyebrow)}</div>
    <h1>${escapeHtml(titleLine)}<br>${escapeHtml(subTitle)}</h1>
    <hr class="rule-gold" style="margin-top:24pt;">
    <p class="deck" style="margin-top:14pt; max-width:115mm; color:var(--text-dim);">
      ${escapeHtml(input.challenge)}
    </p>
  </div>

  <div class="stats" style="position:absolute; bottom:24mm; left:18mm; right:18mm;">
    <div style="border-top:0.6pt solid var(--gold-soft); padding-top:8pt;">
      <div class="stat">${input.scenarios.length}</div>
      <div class="stat-label">${escapeHtml(L.scenariosLabel)}</div>
    </div>
    <div style="border-top:0.6pt solid var(--gold-soft); padding-top:8pt;">
      <div class="stat">${input.totalSources}</div>
      <div class="stat-label">${escapeHtml(L.sourcesLabel)}</div>
    </div>
  </div>
</section>`;
}

// ── TOC ──────────────────────────────────────────────────────────

export interface TocEntry {
  number: string; // "01", "02", …
  title: string;
  caption: string;
  pageNumber: number;
}

export function renderToc(L: LabelTable, meta: PageMeta, entries: TocEntry[]): string {
  const rows = entries
    .map(
      (e) => `
    <div class="toc-row">
      <span class="n">${escapeHtml(e.number)}</span>
      <div class="t"><h4>${escapeHtml(e.title)}</h4><p>${escapeHtml(e.caption)}</p></div>
      <span class="p">${e.pageNumber}</span>
    </div>`,
    )
    .join('');
  return `
<section class="page">
  ${runhead(L, meta)}
  <div class="mono" style="color:var(--text-dim); margin-bottom:6pt;">${escapeHtml(L.tocEyebrow)}</div>
  <h2 style="font-size:32pt; margin-bottom:8pt;">${escapeHtml(L.tocTitle)}</h2>
  <hr class="gold-divider">
  ${rows}
  <div class="mono" style="color:var(--text-dim); position:absolute; bottom:30mm; left:18mm;">${escapeHtml(L.tocFootnote)}</div>
  ${footer(L, meta)}
</section>`;
}

// ── Brief + Resum executiu ───────────────────────────────────────

export function renderBriefExec(input: RenderInput, L: LabelTable, meta: PageMeta): string {
  const headlineStrip =
    input.execHeadlineStats.length > 0
      ? `
      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10pt; margin:14pt 0 10pt 0; border-top:0.5pt solid var(--bg-rule); border-bottom:0.5pt solid var(--bg-rule); padding:8pt 0;">
        ${input.execHeadlineStats
          .slice(0, 3)
          .map(
            (s) => `
        <div>
          <div class="callout-num ${s.accent === 'gold' ? '' : s.accent}">${escapeHtml(s.value)}</div>
          <div class="stat-label">${escapeHtml(s.label)}</div>
        </div>`,
          )
          .join('')}
      </div>`
      : '<hr class="thin" style="margin: 14pt 0 10pt 0;">';

  const paragraphs = input.execParagraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');

  return `
<section class="page">
  ${runhead(L, meta)}
  <div style="display:grid; grid-template-columns: 64mm 1fr; gap: 14mm;">
    <div>
      <div class="chapter-num">01</div>
      <div class="mono chapter-label">${escapeHtml(L.briefLabel)}</div>
      <hr class="rule-gold">

      <div class="mono" style="color:var(--text-dim); margin-top:10pt;">${escapeHtml(L.briefOrg)}</div>
      <h4 style="margin-top:1pt;">${escapeHtml(input.orgName)}</h4>

      <div class="mono" style="color:var(--text-dim); margin-top:8pt;">${escapeHtml(L.briefSector)}</div>
      <h4 style="margin-top:1pt;">${escapeHtml(input.sector)}</h4>

      <div class="mono" style="color:var(--text-dim); margin-top:8pt;">${escapeHtml(L.briefHorizon)}</div>
      <h4 style="margin-top:1pt;">${input.horizonYears} ${input.language === 'en' ? 'years' : input.language === 'ca' ? 'anys' : 'años'}</h4>

      <div class="mono" style="color:var(--text-dim); margin-top:14pt;">${escapeHtml(L.briefChallenge)}</div>
      <p style="font-size:9.5pt; line-height:1.4; margin-top:2pt;">${escapeHtml(input.challenge)}</p>

      <div class="mono" style="color:var(--text-dim); margin-top:10pt;">${escapeHtml(L.briefCapabilities)}</div>
      <p style="font-size:9.5pt; line-height:1.4; margin-top:2pt;">${escapeHtml(input.capabilities)}</p>
    </div>

    <div>
      <div class="chapter-num">02</div>
      <div class="mono chapter-label">${escapeHtml(L.execLabel)}</div>
      <hr class="rule-gold">

      <h2 style="margin-top:8pt;">${escapeHtml(L.execTitle)}</h2>
      <p class="deck" style="margin-top:10pt;">${escapeHtml(input.execDeck)}</p>

      ${headlineStrip}

      <div class="body-col" style="font-size:10pt; line-height:1.45;">
        ${paragraphs}
      </div>
    </div>
  </div>

  ${marginalia(L.briefMarginalia)}
  ${footer(L, meta)}
</section>`;
}

// ── STEEP matrix ─────────────────────────────────────────────────

const STEEP_BADGE_CLASS: Record<SteepDimKey, string> = {
  S: 's',
  T: 't',
  E: 'e',
  ENV: 'env',
  P: 'p',
};

const STEEP_BADGE_TEXT: Record<SteepDimKey, string> = {
  S: 'S',
  T: 'T',
  E: 'E',
  ENV: 'EN',
  P: 'P',
};

const STEEP_ACCENT_CLASS: Record<SteepDimKey, string> = {
  S: 'accent-purple',
  T: 'accent-teal',
  E: 'accent-gold',
  ENV: 'accent-green',
  P: 'accent-red',
};

function renderSteepRow(row: SteepRow): string {
  return `
  <div class="steep-row">
    <div><span class="steep-badge ${STEEP_BADGE_CLASS[row.key]}">${STEEP_BADGE_TEXT[row.key]}</span></div>
    <div class="body">
      <h4 class="${STEEP_ACCENT_CLASS[row.key]}" style="font-size:11pt; margin-bottom:3pt;">${escapeHtml(row.label)}</h4>
      ${escapeHtml(row.global)}
    </div>
    <div class="body body-sectorial">
      <h4 class="${STEEP_ACCENT_CLASS[row.key]}" style="font-size:11pt; margin-bottom:3pt;">&nbsp;</h4>
      ${escapeHtml(row.sectorial)}
    </div>
  </div>`;
}

export function renderSteepMatrix(input: RenderInput, L: LabelTable, meta: PageMeta): string {
  const visible = input.steepDimensions.filter((r) => r.global || r.sectorial);
  return `
<section class="page">
  ${runhead(L, meta)}
  <div class="chapter-head">
    <span class="chapter-num">03</span>
    <h2>${escapeHtml(L.steepTitle)}</h2>
  </div>
  <div class="mono chapter-label" style="margin-left:0;">${escapeHtml(L.steepEyebrow)}</div>
  <hr class="gold-divider">

  <div style="display:grid; grid-template-columns: 30pt 1fr 1fr; gap:10pt; padding-bottom:4pt; border-bottom:0.5pt solid var(--bg-rule);">
    <div></div>
    <div class="mono" style="color:var(--text-dim);">${escapeHtml(L.steepGlobalCol)}</div>
    <div class="mono" style="color:var(--text-dim);">${escapeHtml(L.steepSectorialCol)}</div>
  </div>

  ${visible.map(renderSteepRow).join('')}

  ${marginalia(L.steepMarginalia)}
  ${footer(L, meta)}
</section>`;
}

// ── Uncertainties ────────────────────────────────────────────────

export function renderUncertainties(input: RenderInput, L: LabelTable, meta: PageMeta): string {
  const cells = input.uncertainties
    .slice(0, 4)
    .map(
      (u, i) => `
    <div>
      <div style="display:flex; align-items:baseline; gap:10pt;">
        <span class="chapter-num" style="font-size:22pt;">${String(i + 1).padStart(2, '0')}</span>
        <h4>${escapeHtml(u.title)}</h4>
      </div>
      <p style="font-size:9.8pt; line-height:1.4; margin-top:6pt;">${escapeHtml(u.body)}</p>
    </div>`,
    )
    .join('');

  return `
<section class="page">
  ${runhead(L, meta)}
  <div class="chapter-head">
    <span class="chapter-num">04</span>
    <h2>${escapeHtml(L.uncertTitle)}</h2>
  </div>
  <div class="mono chapter-label">${escapeHtml(L.uncertEyebrow)}</div>
  <hr class="gold-divider">

  <div class="grid-2" style="margin-top:16pt; gap:14pt 18pt;">
    ${cells}
  </div>

  ${marginalia(L.uncertMarginalia)}
  ${footer(L, meta)}
</section>`;
}

// ── 3P index ─────────────────────────────────────────────────────

const BAND_ACCENT_VAR: Record<ScenarioBand, string> = {
  probable: 'var(--teal)',
  plausible: 'var(--blue)',
  possible: 'var(--gold)',
};

export function renderScenariosIndex(
  input: RenderInput,
  L: LabelTable,
  meta: PageMeta,
): string {
  // Normalise the three probabilities so the stack always sums to 100
  // (per the spec). If they already do, this is a no-op.
  const totals = input.scenarios.reduce((s, sc) => s + sc.probabilityPct, 0);
  const norm = (n: number) => (totals > 0 ? Math.round((n / totals) * 100) : 0);

  const segs = input.scenarios
    .map(
      (sc) =>
        `<div class="seg ${sc.band}" style="flex:${norm(sc.probabilityPct)};">${norm(sc.probabilityPct)}%&nbsp;${escapeHtml(sc.bandLabel)}</div>`,
    )
    .join('');

  const legend = input.scenarios
    .map(
      (sc) => `
      <div><span class="sw" style="background:${BAND_ACCENT_VAR[sc.band]};"></span><span class="mono" style="color:${BAND_ACCENT_VAR[sc.band]};">${escapeHtml(sc.bandLabel)} · ${String(sc.index).padStart(2, '0')}</span></div>`,
    )
    .join('');

  const rows = input.scenarios
    .map(
      (sc) => `
    <div class="toc-row">
      <span class="n">${String(sc.index).padStart(2, '0')}</span>
      <div class="t">
        <div class="mono" style="color:${BAND_ACCENT_VAR[sc.band]}; margin-bottom:2pt;">${escapeHtml(sc.bandLabel)}</div>
        <h4>${escapeHtml(sc.title)}</h4>
        <p>${escapeHtml(sc.caption)}</p>
      </div>
      <span class="p" style="color:${BAND_ACCENT_VAR[sc.band]};">${norm(sc.probabilityPct)}%</span>
    </div>`,
    )
    .join('');

  return `
<section class="page">
  ${runhead(L, meta)}
  <div class="chapter-head">
    <span class="chapter-num">05</span>
    <h2>${escapeHtml(L.scenariosTitle)}</h2>
  </div>
  <div class="mono chapter-label">${escapeHtml(L.scenariosEyebrow)}</div>
  <hr class="gold-divider">

  <p class="deck" style="margin-top:10pt; max-width:155mm;">${escapeHtml(input.scenariosDeck)}</p>

  <div class="stack-bar">${segs}</div>
  <div class="stack-legend">${legend}</div>

  <div style="margin-top:24pt;">${rows}</div>

  ${marginalia(L.scenariosIndexMarginalia)}
  ${footer(L, meta)}
</section>`;
}

// ── Scenario detail ──────────────────────────────────────────────

const BAND_TAG: Record<ScenarioBand, string> = {
  probable: 'probable',
  plausible: 'plausible',
  possible: 'possible',
};

const BAND_CARD: Record<ScenarioBand, string> = {
  probable: 'teal',
  plausible: 'blue',
  possible: 'gold',
};

const BAND_CALLOUT: Record<ScenarioBand, string> = {
  probable: 'teal',
  plausible: 'blue',
  possible: '', // gold is the default
};

function bullets(items: string[]): string {
  return `<ul>${items.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
}

export function renderScenarioDetail(
  sc: ScenarioRow,
  _input: RenderInput,
  L: LabelTable,
  meta: PageMeta,
): string {
  const accentVar = BAND_ACCENT_VAR[sc.band];
  const tagClass = BAND_TAG[sc.band];
  const cardClass = BAND_CARD[sc.band];
  const calloutClass = BAND_CALLOUT[sc.band];

  // Two paragraphs of body — render whatever is available (0–2).
  const body = sc.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');

  return `
<section class="page">
  ${runhead(L, meta)}

  <div style="display:flex; justify-content:space-between; align-items:flex-start;">
    <span class="tag ${tagClass}">${escapeHtml(sc.bandLabel)}</span>
    <div style="text-align:right;">
      <div class="chapter-num">${String(sc.index).padStart(2, '0')}</div>
      <div class="mono chapter-label">${escapeHtml(L.scenarioLabel)}</div>
    </div>
  </div>

  <h1 style="font-size:32pt; margin-top:14pt;">${sc.titleBroken}</h1>
  <hr class="rule-gold" style="margin-top:14pt;">

  <div style="display:grid; grid-template-columns: 1fr 60mm; gap:14pt; margin-top:8pt;">
    <p class="deck" style="font-size:12pt;">${escapeHtml(sc.deck)}</p>
    <div style="text-align:right;">
      <div class="mono" style="color:var(--text-dim);">${escapeHtml(L.scenarioProbability)}</div>
      <div class="callout-num ${calloutClass}" style="font-size:36pt;">${sc.probabilityPct}%</div>
      <div style="height:4pt; background:var(--bg-rule); border-radius:1pt; margin-top:6pt; overflow:hidden;">
        <div style="height:100%; width:${sc.probabilityPct}%; background:${accentVar};"></div>
      </div>
    </div>
  </div>

  <div class="body-col" style="margin-top:14pt; font-size:10pt;">${body}</div>

  <div class="grid-3" style="margin-top:14pt;">
    <div class="card ${cardClass}">
      <div style="display:flex; justify-content:space-between;">
        <h4 style="color:${accentVar};">${escapeHtml(L.scenarioOpportunities)}</h4>
        <span class="mono" style="color:var(--text-dim);">${String(sc.opportunities.length).padStart(2, '0')}</span>
      </div>
      ${bullets(sc.opportunities)}
    </div>
    <div class="card red">
      <div style="display:flex; justify-content:space-between;">
        <h4 style="color:var(--red);">${escapeHtml(L.scenarioThreats)}</h4>
        <span class="mono" style="color:var(--text-dim);">${String(sc.threats.length).padStart(2, '0')}</span>
      </div>
      ${bullets(sc.threats)}
    </div>
    <div class="card purple">
      <div style="display:flex; justify-content:space-between;">
        <h4 style="color:var(--purple);">${escapeHtml(L.scenarioFactors)}</h4>
        <span class="mono" style="color:var(--text-dim);">${String(sc.successFactors.length).padStart(2, '0')}</span>
      </div>
      ${bullets(sc.successFactors)}
    </div>
  </div>

  ${sc.firstMove
    ? `
  <div class="first-move">
    <div class="label">${escapeHtml(L.scenarioFirstMove)}</div>
    <div class="text">${escapeHtml(sc.firstMove)}</div>
  </div>`
    : ''}

  ${marginalia(sc.bandLabel)}
  ${footer(L, meta)}
</section>`;
}

// ── Backcasting ──────────────────────────────────────────────────

export function renderBackcasting(input: RenderInput, L: LabelTable, meta: PageMeta): string {
  const m: BackcastingMatrix = input.backcastingMatrix;
  const yearStart = input.backcastingStartingYear;
  const yearEnd = m.years[0] ?? yearStart;

  const heads = `
  <div class="bc-matrix" style="margin-top:14pt;">
    <div></div>
    ${m.columnHeads
      .map(
        (h) =>
          `<div class="col-head ${h.band}">${escapeHtml(h.label)}</div>`,
      )
      .join('')}
  </div>`;

  const rows = m.rows
    .map(
      (r) => `
  <div class="bc-matrix">
    <div class="year">${escapeHtml(r.year)}</div>
    <div class="cell probable">
      <h4>${escapeHtml(r.probable.title)}</h4>
      <p>${escapeHtml(r.probable.body)}</p>
    </div>
    <div class="cell plausible">
      <h4>${escapeHtml(r.plausible.title)}</h4>
      <p>${escapeHtml(r.plausible.body)}</p>
    </div>
    <div class="cell possible">
      <h4>${escapeHtml(r.possible.title)}</h4>
      <p>${escapeHtml(r.possible.body)}</p>
    </div>
  </div>`,
    )
    .join('');

  return `
<section class="page">
  ${runhead(L, meta)}
  <div class="chapter-head">
    <span class="chapter-num">06</span>
    <h2>${escapeHtml(L.backcastingTitle)}</h2>
  </div>
  <div class="mono chapter-label">${escapeHtml(L.backcastingEyebrow(yearStart, yearEnd))}</div>
  <hr class="gold-divider">

  ${heads}
  ${rows}

  <hr class="thin" style="margin-top:18pt;">

  <div class="mono" style="color:var(--text-dim); margin-top:10pt;">${escapeHtml(L.backcastingStartingLabel(yearStart))}</div>
  <p style="font-style:italic; font-size:10pt; margin-top:4pt; max-width:155mm;">
    ${escapeHtml(input.backcastingStartingPoint)}
  </p>

  ${marginalia(L.backcastingMarginalia)}
  ${footer(L, meta)}
</section>`;
}

// ── Strategic map ────────────────────────────────────────────────

function renderStrategicCard(card: StrategicCard, _accent: string, cardCls: string): string {
  return `
  <div class="card ${cardCls}" style="margin-top:10pt;">
    <div style="display:flex; justify-content:space-between;">
      <span class="mono" style="font-size:7pt; color:var(--text-dim);">${escapeHtml(card.window)}</span>
      <span class="tag ${card.priority}">${escapeHtml(card.priorityLabel)}</span>
    </div>
    <h4 style="margin-top:4pt;">${escapeHtml(card.title)}</h4>
    ${bullets(card.bullets)}
  </div>`;
}

function renderStrategicColumn(
  numeral: string,
  numeralColor: string,
  label: string,
  caption: string,
  row: StrategicRow,
  cardCls: string,
): string {
  return `
    <div>
      <div style="display:flex; align-items:baseline; gap:6pt;">
        <span class="chapter-num" style="font-size:24pt; color:${numeralColor};">${escapeHtml(numeral)}</span>
        <div>
          <div class="mono" style="color:var(--text-dim);">${escapeHtml(label)}</div>
          <h4>${escapeHtml(caption)}</h4>
        </div>
      </div>
      <hr style="border:0; border-top:1pt solid ${numeralColor}; margin:6pt 0 0 0;">

      ${row.cards.map((c) => renderStrategicCard(c, numeralColor, cardCls)).join('')}
    </div>`;
}

export function renderStrategicMap(input: RenderInput, L: LabelTable, meta: PageMeta): string {
  return `
<section class="page">
  ${runhead(L, meta)}
  <div class="chapter-head">
    <span class="chapter-num">07</span>
    <h2>${escapeHtml(L.strategicTitle)}</h2>
  </div>
  <div class="mono chapter-label">${escapeHtml(L.strategicEyebrow)}</div>
  <hr class="gold-divider">

  <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12pt; margin-top:14pt;">
    ${renderStrategicColumn('H1', 'var(--teal)', L.strategicH1, L.strategicH1Caption, input.strategicMap.h1, 'teal')}
    ${renderStrategicColumn('H2', 'var(--blue)', L.strategicH2, L.strategicH2Caption, input.strategicMap.h2, 'blue')}
    ${renderStrategicColumn('H3', 'var(--gold)', L.strategicH3, L.strategicH3Caption, input.strategicMap.h3, 'gold')}
  </div>

  ${marginalia(L.strategicMarginalia)}
  ${footer(L, meta)}
</section>`;
}

// ── Signals + wildcards ─────────────────────────────────────────

const SIGNAL_CARD_CLASS: Record<SteepDimKey, string> = {
  S: 'purple',
  T: 'teal',
  E: 'gold',
  ENV: 'green',
  P: 'red',
};

function renderSignalCard(s: SignalRow): string {
  const accent =
    s.dim === 'S' ? 'var(--purple)' : s.dim === 'T' ? 'var(--teal)' : s.dim === 'E' ? 'var(--gold)' : s.dim === 'ENV' ? 'var(--green)' : 'var(--red)';
  return `
    <div class="card ${SIGNAL_CARD_CLASS[s.dim]}" style="padding:6pt 9pt;">
      <div style="display:flex; align-items:baseline; gap:6pt;">
        <span class="steep-badge ${STEEP_BADGE_CLASS[s.dim]}" style="width:14pt; height:14pt; font-size:6.5pt;">${STEEP_BADGE_TEXT[s.dim]}</span>
        <div class="mono" style="font-size:6.5pt; color:${accent};">${escapeHtml(s.dimLabel)}</div>
      </div>
      <h4 style="margin-top:3pt; font-size:10pt;">${escapeHtml(s.title)}</h4>
      <p style="font-size:8.3pt; line-height:1.3; margin-top:3pt;">${escapeHtml(s.body)}</p>
    </div>`;
}

export function renderSignals(input: RenderInput, L: LabelTable, meta: PageMeta): string {
  const signalCards = input.signals.map(renderSignalCard).join('');
  // Pad the 3-column × 2-row grid (6 slots) so a card list of 5
  // leaves the last cell visually balanced.
  const filler = input.signals.length < 6 ? '<div></div>'.repeat(6 - input.signals.length) : '';

  const wildcardCards = input.wildcards
    .map(
      (w) => `
    <div class="card" style="padding:6pt 9pt;">
      <h4 style="font-size:10pt;">${escapeHtml(w.title)}</h4>
      <p style="font-size:8.3pt; line-height:1.3; margin-top:3pt;">${escapeHtml(w.body)}</p>
    </div>`,
    )
    .join('');

  return `
<section class="page">
  ${runhead(L, meta)}
  <div class="chapter-head">
    <span class="chapter-num">08</span>
    <h2>${escapeHtml(L.signalsTitle)}</h2>
  </div>
  <div class="mono chapter-label">${escapeHtml(L.signalsEyebrow)}</div>
  <hr class="gold-divider">

  ${input.signals.length > 0 ? `<div class="mono" style="margin-top:8pt; color:var(--text-dim);">${escapeHtml(L.signalsListHeader)}</div>
  <div class="grid-3" style="margin-top:5pt;">${signalCards}${filler}</div>` : ''}

  ${input.wildcards.length > 0 ? `<hr class="thin" style="margin-top:10pt;">
  <div class="mono" style="color:var(--text-dim);">${escapeHtml(L.wildcardsListHeader)}</div>
  <div class="grid-3" style="margin-top:5pt;">${wildcardCards}</div>` : ''}

  ${marginalia(L.signalsMarginalia)}
  ${footer(L, meta)}
</section>`;
}

// ── Bibliography ────────────────────────────────────────────────

const BIBLIO_ITEMS_PER_PAGE = 28;

/**
 * Build the bibliography pages. Returns an array because biblio
 * content typically spans multiple pages. The first page carries the
 * chapter header; subsequent pages skip directly to the next section
 * title (per §5.12).
 */
export function renderBibliographyPages(
  input: RenderInput,
  L: LabelTable,
  pageNumbers: number[],
  totalPages: number,
  runheadRight: string,
): string[] {
  if (input.biblioSections.length === 0) return [];

  // Allocate items across pages — preserve section grouping. Each
  // page can hold ~28 items max; section headers force their items
  // to stay together (push to next page if not enough room).
  type Block =
    | { kind: 'header'; title: string; size: 0 }
    | { kind: 'item'; title: string; url: string };

  const blocks: Block[] = [];
  for (const sec of input.biblioSections) {
    blocks.push({ kind: 'header', title: sec.title, size: 0 });
    for (const it of sec.items) {
      blocks.push({ kind: 'item', title: it.title, url: it.url });
    }
  }

  // Group blocks into pages: track running item count, flush on
  // BIBLIO_ITEMS_PER_PAGE.
  const groups: Block[][] = [];
  let bucket: Block[] = [];
  let count = 0;
  for (const b of blocks) {
    if (b.kind === 'item') {
      if (count >= BIBLIO_ITEMS_PER_PAGE) {
        groups.push(bucket);
        bucket = [];
        count = 0;
      }
      bucket.push(b);
      count += 1;
    } else {
      // header: if we're close to the page limit and adding this
      // header would only leave room for a couple of items, push to
      // next page to keep the section visually together.
      if (count > 0 && count >= BIBLIO_ITEMS_PER_PAGE - 4) {
        groups.push(bucket);
        bucket = [];
        count = 0;
      }
      bucket.push(b);
    }
  }
  if (bucket.length > 0) groups.push(bucket);

  return groups.map((group, idx) => {
    const items: string[] = [];
    // Counter is global across all biblio pages (not reset per page),
    // so compute the starting offset from prior groups' item counts.
    let counter = 0;
    for (let g = 0; g < idx; g++) {
      const grp = groups[g];
      if (!grp) continue;
      for (const b of grp) if (b.kind === 'item') counter += 1;
    }

    const grid: string[] = [];
    let currentGridOpen = false;
    const openGrid = () => {
      if (!currentGridOpen) {
        grid.push('<div class="biblio-grid">');
        currentGridOpen = true;
      }
    };
    const closeGrid = () => {
      if (currentGridOpen) {
        grid.push('</div>');
        currentGridOpen = false;
      }
    };

    for (const b of group) {
      if (b.kind === 'header') {
        closeGrid();
        grid.push(
          `<h3 class="biblio-section-title">${escapeHtml(b.title)}</h3>`,
        );
        // The biblio-section-title is `grid-column: 1 / -1` so we
        // need to wrap it in a grid for the layout to apply. Open a
        // new grid immediately to host its following items.
        openGrid();
      } else {
        openGrid();
        counter += 1;
        grid.push(
          `<div class="biblio-item"><span class="n">${String(counter).padStart(2, '0')}</span><span><span class="t">${escapeHtml(b.title)}</span>${b.url ? `<span class="u">${escapeHtml(compactUrl(b.url))}</span>` : ''}</span></div>`,
        );
      }
    }
    closeGrid();

    const pageNumber = pageNumbers[idx] ?? 0;
    const meta: PageMeta = { pageNumber, totalPages, runheadRight };

    // First biblio page carries the chapter header. Subsequent pages
    // skip directly to the next section title.
    const header = idx === 0
      ? `
  <div class="chapter-head">
    <span class="chapter-num">09</span>
    <h2>${escapeHtml(L.sourcesTitle)}</h2>
  </div>
  <div class="mono chapter-label">${escapeHtml(L.sourcesEyebrow(input.totalSources))}</div>
  <hr class="gold-divider">
  <p class="deck" style="margin-top:8pt; max-width:165mm; font-size:11pt;">${escapeHtml(L.sourcesDeck)}</p>`
      : '';

    items.push(`
<section class="page">
  ${runhead(L, meta)}
  ${header}
  ${grid.join('')}
  ${marginalia(L.sourcesMarginalia)}
  ${footer(L, meta)}
</section>`);
    return items.join('');
  });
}

// ── Closing ─────────────────────────────────────────────────────

export function renderClosing(L: LabelTable): string {
  // Split the tagline at the emphasised portion so the renderer can
  // wrap that span in <em>. Splits on the FIRST occurrence to support
  // both "El futur no es prediu, es dissenya." (where the comma sits
  // outside the <em>) and the English "it's designed." style.
  const t = L.closingTagline;
  const emIdx = t.toLowerCase().indexOf(L.closingTaglineEm.toLowerCase());
  let tagHtml = escapeHtml(t);
  if (emIdx >= 0) {
    const head = t.slice(0, emIdx).trimEnd();
    const em = t.slice(emIdx, emIdx + L.closingTaglineEm.length);
    const tail = t.slice(emIdx + L.closingTaglineEm.length);
    tagHtml = `${escapeHtml(head)},<br><em>${escapeHtml(em)}</em>${escapeHtml(tail)}`;
  }
  return `
<section class="page" style="padding:0;">
  <div class="closing">
    <div class="brand">Futuros</div>
    <hr>
    <div class="tag">${tagHtml}</div>
    <hr>
    <div class="domain">${escapeHtml(L.closingDomain)}</div>
  </div>
</section>`;
}
