/**
 * Character budgets for the Verdalia foresight-report layout — sourced
 * verbatim from §10 of LAYOUT_SPEC.md.
 *
 * <p>Each budget describes the maximum character length a slot can hold
 * before the rendered page overflows its A4 frame. The
 * {@link ../tighten.ts} pre-pass walks the input data, compares every
 * field against its budget, and routes anything that exceeds it through
 * the {@code /api/ai/tighten} endpoint with the budget as the
 * {@code maxChars} target. The renderer can then emit HTML without
 * worrying about page-break drift.
 *
 * <p>Where the spec lists a range, we take the tighter end so the
 * tightening prompt aims for the conservative budget.
 */
export const BUDGETS = {
  // ── Cover ────────────────────────────────────────────────────────
  coverEyebrow: 70,
  coverH1: 56,
  coverDeck: 220,
  coverStatNumber: 6,
  coverStatLabel: 24,

  // ── TOC ──────────────────────────────────────────────────────────
  tocChapterTitle: 42,
  tocChapterCaption: 80,

  // ── Brief + executive ────────────────────────────────────────────
  briefShortValue: 24, // organisation, sector, horizon
  briefChallenge: 240,
  briefCapabilities: 380,
  execDeck: 180,
  execHeadlineValue: 8,
  execHeadlineLabel: 28,
  /** Per-paragraph cap; the page accepts up to 3 paragraphs. */
  execParagraph: 250,

  // ── STEEP matrix (per dimension row) ─────────────────────────────
  steepDimensionH4: 18,
  steepGlobal: 380,
  steepSectorial: 280,

  // ── Uncertainties (2×2) ──────────────────────────────────────────
  uncertaintyTitle: 60,
  uncertaintyBody: 550,

  // ── 3P index ─────────────────────────────────────────────────────
  scenarioIndexDeck: 180,
  scenarioIndexRowTitle: 60,
  scenarioIndexRowCaption: 120,

  // ── Scenario detail (×3) ─────────────────────────────────────────
  scenarioH1: 72,
  scenarioDeck: 180,
  /** Per-paragraph cap (two paragraphs per scenario). */
  scenarioBodyParagraph: 600,
  scenarioBullet: 140,
  scenarioFirstMove: 220,

  // ── Backcasting cell ─────────────────────────────────────────────
  backcastingCellTitle: 48,
  backcastingCellBody: 260,
  backcastingStartingPoint: 400,

  // ── Strategic map card ───────────────────────────────────────────
  strategicCardTitle: 60,
  strategicCardBullet: 140,

  // ── Signals + wildcards ──────────────────────────────────────────
  signalTitle: 48,
  signalBody: 240,
  wildcardTitle: 64,
  wildcardBody: 240,

  // ── Bibliography ─────────────────────────────────────────────────
  biblioSectionTitle: 48,
  biblioItemTitle: 96,
  biblioItemUrl: 72,
} as const;

export type BudgetKey = keyof typeof BUDGETS;
