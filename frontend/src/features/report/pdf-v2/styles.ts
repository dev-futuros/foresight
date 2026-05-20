/**
 * The Verdalia foresight-report stylesheet as a JS string.
 *
 * <p>Lifted verbatim from {@code verdalia_foresight_2026_redesign.html}'s
 * {@code <style>} blocks (LAYOUT_SPEC.md §2–§5). The {@code @font-face}
 * URLs resolve against {@code /fonts/} on the same origin — the static
 * TTFs ship from {@code frontend/public/fonts/}, so the iframe doc sees
 * them without an extra fetch hop.
 *
 * <p>Kept as a single string (instead of importing a {@code .css} file)
 * because the renderer needs to inline the full stylesheet into the
 * iframe's {@code <head>} — the iframe doesn't run through Vite, so a
 * regular CSS import wouldn't reach it. Editing here is the same as
 * editing a regular stylesheet; the doc comment in this file IS the
 * change log.
 */
export function buildStyles(fontBaseUrl: string): string {
  return `
@font-face {
  font-family: 'Playfair Display';
  src: url('${fontBaseUrl}PlayfairDisplay-Regular.ttf') format('truetype');
  font-weight: 400; font-style: normal;
}
@font-face {
  font-family: 'Playfair Display';
  src: url('${fontBaseUrl}PlayfairDisplay-Bold.ttf') format('truetype');
  font-weight: 700; font-style: normal;
}
@font-face {
  font-family: 'Playfair Display';
  src: url('${fontBaseUrl}PlayfairDisplay-Italic.ttf') format('truetype');
  font-weight: 400; font-style: italic;
}
@font-face {
  font-family: 'DM Sans';
  src: url('${fontBaseUrl}DMSans-Regular.ttf') format('truetype');
  font-weight: 400; font-style: normal;
}
@font-face {
  font-family: 'DM Sans';
  src: url('${fontBaseUrl}DMSans-Medium.ttf') format('truetype');
  font-weight: 500; font-style: normal;
}
@font-face {
  font-family: 'DM Sans';
  src: url('${fontBaseUrl}DMSans-Italic.ttf') format('truetype');
  font-weight: 400; font-style: italic;
}
@font-face {
  font-family: 'DM Mono';
  src: url('${fontBaseUrl}DMMono-Regular.ttf') format('truetype');
  font-weight: 400; font-style: normal;
}
@font-face {
  font-family: 'DM Mono';
  src: url('${fontBaseUrl}DMMono-Medium.ttf') format('truetype');
  font-weight: 500; font-style: normal;
}
@font-face {
  font-family: 'DM Mono';
  src: url('${fontBaseUrl}DMMono-Italic.ttf') format('truetype');
  font-weight: 400; font-style: italic;
}

:root {
  --bg: #0c0a07;
  --bg-rule: #1d1a14;
  --text: #ece6d6;
  --text-dim: #8a8576;
  --text-muted: #5f5b50;
  --gold: #c9a36f;
  --gold-soft: #a88857;
  --teal: #7fd1b9;
  --blue: #9ab8db;
  --purple: #c5a3d6;
  --red: #e08a6f;
  --green: #6fd19a;
}

@page { size: A4 portrait; margin: 0; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: 'Playfair Display', 'Georgia', serif;
  font-size: 11pt;
  line-height: 1.45;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page {
  width: 210mm;
  height: 297mm;
  box-sizing: border-box;
  padding: 16mm 18mm 22mm 18mm;
  position: relative;
  page-break-after: always;
  overflow: hidden;
}
.page:last-child { page-break-after: auto; }

/* MONO labels */
.mono {
  font-family: 'DM Mono', 'Consolas', monospace;
  font-weight: 400;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 8.5pt;
}
.mono-sm { font-size: 7.5pt; }
.mono-lg { font-size: 9.5pt; }

.runhead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 4pt;
  border-bottom: 0.6pt solid var(--gold-soft);
  margin-bottom: 14mm;
}
.runhead .left { color: var(--gold); }
.runhead .right { font-family: 'DM Mono', monospace; font-size: 8.5pt; color: var(--text-dim); }

.footer {
  position: absolute;
  bottom: 10mm;
  left: 18mm;
  right: 18mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 6pt;
  border-top: 0.6pt solid var(--bg-rule);
}
.footer .left { font-family: 'DM Mono', monospace; font-size: 8.5pt; color: var(--gold); }
.footer .right {
  font-family: 'DM Mono', monospace;
  font-size: 8.5pt;
  color: var(--text-dim);
  background: #161310;
  padding: 2pt 7pt;
  border-radius: 2pt;
}

.marginalia {
  position: absolute;
  left: 6mm;
  top: 50%;
  transform: translateY(-50%) rotate(-90deg);
  transform-origin: center;
  font-family: 'DM Mono', monospace;
  font-size: 7pt;
  letter-spacing: 0.18em;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}
.marginalia::before { content: "[  "; }
.marginalia::after  { content: "  ]"; }

h1, h2, h3, h4 {
  font-family: 'Playfair Display', serif;
  font-weight: 400;
  margin: 0;
  color: var(--text);
}
h1 { font-size: 38pt; line-height: 1.05; letter-spacing: -0.005em; }
h2 { font-size: 26pt; line-height: 1.1; }
h3 { font-size: 14pt; line-height: 1.25; font-weight: 700; }
h4 { font-size: 12pt; line-height: 1.3; font-weight: 700; }

.deck {
  font-style: italic;
  font-size: 13pt;
  line-height: 1.45;
  color: var(--text);
  margin: 0;
}

.chapter-num {
  font-family: 'Playfair Display', serif;
  font-style: italic;
  font-size: 32pt;
  line-height: 1;
  color: var(--text);
  font-weight: 400;
}

.rule-gold {
  width: 36pt;
  height: 0.8pt;
  background: var(--gold);
  margin: 8pt 0;
  border: 0;
}

.chapter-head {
  display: flex;
  align-items: baseline;
  gap: 14pt;
  margin-bottom: 4pt;
}
.chapter-label {
  color: var(--text-dim);
  margin-top: 4pt;
}

.accent-gold  { color: var(--gold); }
.accent-teal  { color: var(--teal); }
.accent-blue  { color: var(--blue); }
.accent-purple{ color: var(--purple); }
.accent-red   { color: var(--red); }
.accent-green { color: var(--green); }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt 18pt; }
.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12pt 14pt; }
.grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10pt 12pt; }

.body-col p { margin: 0 0 6pt 0; text-align: justify; hyphens: auto; }

hr.thin { border: 0; border-top: 0.5pt solid var(--bg-rule); margin: 12pt 0; }
hr.gold-divider { border: 0; border-top: 0.6pt solid var(--gold-soft); margin: 10pt 0; }

.stat {
  font-family: 'Playfair Display', serif;
  font-weight: 400;
  font-size: 30pt;
  line-height: 1;
  color: var(--gold);
  font-style: italic;
}
.stat-label {
  font-family: 'DM Mono', monospace;
  text-transform: uppercase;
  font-size: 7pt;
  color: var(--text-dim);
  letter-spacing: 0.1em;
  margin-top: 4pt;
}

.callout-num {
  font-family: 'Playfair Display', serif;
  font-weight: 400;
  font-style: italic;
  font-size: 22pt;
  color: var(--gold);
  line-height: 1;
}
.callout-num.teal { color: var(--teal); }
.callout-num.blue { color: var(--blue); }

.tag {
  display: inline-block;
  padding: 1.5pt 6pt;
  border-radius: 2pt;
  font-family: 'DM Mono', monospace;
  font-size: 7pt;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.tag.probable  { background: rgba(127,209,185,0.15); color: var(--teal); }
.tag.plausible { background: rgba(154,184,219,0.15); color: var(--blue); }
.tag.possible  { background: rgba(201,163,111,0.15); color: var(--gold); }
.tag.alt   { background: rgba(127,209,185,0.18); color: var(--teal); }
.tag.mitja { background: rgba(154,184,219,0.18); color: var(--blue); }
.tag.baix  { background: rgba(224,138,111,0.18); color: var(--red); }

.steep-badge {
  display: inline-flex;
  width: 22pt;
  height: 22pt;
  align-items: center;
  justify-content: center;
  border-radius: 3pt;
  font-family: 'DM Mono', monospace;
  font-size: 8.5pt;
  font-weight: 500;
  text-transform: uppercase;
  color: var(--bg);
}
.steep-badge.s   { background: var(--purple); }
.steep-badge.t   { background: var(--teal); }
.steep-badge.e   { background: var(--gold); }
.steep-badge.env { background: var(--green); }
.steep-badge.p   { background: var(--red); }

.card {
  background: #110e0a;
  border-left: 2pt solid var(--gold-soft);
  padding: 8pt 10pt;
  border-radius: 1pt;
}
.card.teal  { border-left-color: var(--teal); }
.card.blue  { border-left-color: var(--blue); }
.card.gold  { border-left-color: var(--gold); }
.card.red   { border-left-color: var(--red); }
.card.purple{ border-left-color: var(--purple); }
.card.green { border-left-color: var(--green); }
.card h4 { margin-bottom: 4pt; }

.card ul, ul.bullets {
  list-style: none;
  padding-left: 0;
  margin: 4pt 0 0 0;
}
.card li, ul.bullets li {
  position: relative;
  padding-left: 10pt;
  margin-bottom: 2.5pt;
  font-size: 9.3pt;
  line-height: 1.32;
}
.card li::before, ul.bullets li::before {
  content: "•";
  position: absolute;
  left: 0;
  top: 0;
  color: var(--gold);
}
.card.teal li::before { color: var(--teal); }
.card.blue li::before { color: var(--blue); }
.card.red li::before { color: var(--red); }
.card.purple li::before { color: var(--purple); }
.card.green li::before { color: var(--green); }

.stack-bar {
  display: flex;
  width: 100%;
  height: 28pt;
  border-radius: 2pt;
  overflow: hidden;
  margin: 12pt 0 6pt 0;
}
.stack-bar .seg {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0 8pt;
  font-family: 'DM Mono', monospace;
  font-size: 9pt;
  color: var(--bg);
  font-weight: 500;
}
.stack-bar .seg.probable  { background: var(--teal); }
.stack-bar .seg.plausible { background: var(--blue); }
.stack-bar .seg.possible  { background: var(--gold); }

.stack-legend {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8pt;
  margin-top: 10pt;
}
.stack-legend .sw {
  display: inline-block;
  width: 8pt; height: 8pt; border-radius: 2pt;
  margin-right: 5pt;
  vertical-align: middle;
}

.steep-row {
  display: grid;
  grid-template-columns: 30pt 1fr 1fr;
  gap: 10pt;
  padding: 7pt 0;
  border-top: 0.5pt solid var(--bg-rule);
  align-items: start;
}
.steep-row:first-child { border-top: 0; padding-top: 4pt; }
.steep-row .body { font-size: 9.3pt; line-height: 1.36; }
.steep-row .body-sectorial { color: var(--text-dim); }
.steep-row .body h4 { font-size: 10.5pt; margin-bottom: 2pt; }

.bc-matrix {
  display: grid;
  grid-template-columns: 36pt 1fr 1fr 1fr;
  gap: 8pt;
  margin-top: 10pt;
}
.bc-matrix .year {
  font-family: 'Playfair Display', serif;
  font-style: italic;
  font-size: 18pt;
  color: var(--text);
  line-height: 1;
  padding-top: 4pt;
}
.bc-matrix .cell {
  background: #110e0a;
  padding: 7pt 8pt;
  border-left: 2pt solid var(--bg-rule);
  border-radius: 1pt;
}
.bc-matrix .cell.probable  { border-left-color: var(--teal); }
.bc-matrix .cell.plausible { border-left-color: var(--blue); }
.bc-matrix .cell.possible  { border-left-color: var(--gold); }
.bc-matrix h4 {
  font-size: 10pt;
  margin-bottom: 3pt;
  font-family: 'Playfair Display', serif;
  font-weight: 700;
}
.bc-matrix p { font-size: 8.8pt; line-height: 1.35; margin: 0; }
.bc-matrix .col-head {
  font-family: 'DM Mono', monospace;
  font-size: 7.5pt;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding-bottom: 4pt;
  border-bottom: 0.5pt solid var(--bg-rule);
}
.bc-matrix .col-head.probable  { color: var(--teal); }
.bc-matrix .col-head.plausible { color: var(--blue); }
.bc-matrix .col-head.possible  { color: var(--gold); }

.biblio-section-title {
  font-family: 'Playfair Display', serif;
  font-size: 14pt;
  font-weight: 700;
  color: var(--gold);
  margin: 14pt 0 6pt 0;
  padding-bottom: 4pt;
  border-bottom: 0.6pt solid var(--gold-soft);
  grid-column: 1 / -1;
}
.biblio-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4pt 16pt;
}
.biblio-item {
  display: grid;
  grid-template-columns: 14pt 1fr;
  gap: 4pt;
  padding: 1pt 0;
  font-size: 7.5pt;
  line-height: 1.22;
}
.biblio-item .n {
  font-family: 'DM Mono', monospace;
  font-size: 6.5pt;
  color: var(--text-muted);
  padding-top: 1pt;
}
.biblio-item .t {
  color: var(--text);
  font-family: 'Playfair Display', serif;
  font-size: 8.5pt;
  line-height: 1.22;
}
.biblio-item .u {
  color: var(--gold-soft);
  font-family: 'DM Mono', monospace;
  font-size: 6pt;
  font-style: italic;
  word-break: break-all;
  display: block;
  margin-top: 1pt;
}

.first-move {
  background: rgba(127,209,185,0.06);
  border-left: 2.5pt solid var(--teal);
  padding: 7pt 12pt;
  margin-top: 8pt;
}
.first-move .label {
  font-family: 'DM Mono', monospace;
  font-size: 7.5pt;
  text-transform: uppercase;
  color: var(--teal);
  letter-spacing: 0.1em;
  margin-bottom: 3pt;
}
.first-move .text { font-size: 9.5pt; line-height: 1.4; }

.cover { padding: 30mm 18mm 14mm 18mm; }
.cover .meta { color: var(--text-dim); }
.cover h1 { font-size: 48pt; line-height: 1.02; margin-top: 8pt; }
.cover .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 30pt; margin-top: 30pt; }

.toc-row {
  display: grid;
  grid-template-columns: 30pt 1fr 40pt;
  gap: 12pt;
  align-items: baseline;
  padding: 8pt 0;
  border-top: 0.4pt solid var(--bg-rule);
}
.toc-row .n {
  font-family: 'Playfair Display', serif;
  font-style: italic;
  font-size: 18pt;
  color: var(--text-dim);
}
.toc-row .t h4 { font-size: 13pt; font-weight: 700; }
.toc-row .t p { font-style: italic; color: var(--text-dim); font-size: 9.5pt; margin: 1pt 0 0 0; }
.toc-row .p {
  text-align: right;
  font-family: 'Playfair Display', serif;
  font-style: italic;
  font-size: 20pt;
  color: var(--gold);
  font-weight: 400;
}

.closing {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.closing .brand {
  font-family: 'Playfair Display', serif;
  font-style: italic;
  font-size: 22pt;
  color: var(--gold);
}
.closing .tag {
  font-family: 'Playfair Display', serif;
  font-size: 30pt;
  line-height: 1.25;
  margin: 30pt 0;
  background: none;
  color: var(--text);
  padding: 0;
  text-transform: none;
  letter-spacing: 0;
}
.closing .tag em { font-style: italic; color: var(--gold); }
.closing .domain {
  font-family: 'DM Mono', monospace;
  font-size: 9pt;
  color: var(--text-dim);
  letter-spacing: 0.1em;
}
.closing hr {
  width: 60pt; border: 0; border-top: 0.6pt solid var(--gold); margin: 4pt 0;
}
`;
}
