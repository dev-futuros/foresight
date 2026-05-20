import type { LanguageCode } from '../../../i18n/languages';
import { tighten } from '../api/tighten';
import { logger } from '../../../lib/log';
import { BUDGETS } from './budgets';
import type { RenderInput } from './project';

/**
 * AI tightening pre-pass.
 *
 * <p>Walks the {@link RenderInput} from {@link project.projectReport},
 * compares every field against its budget in {@link BUDGETS}, and
 * routes anything that overshoots through {@code /api/ai/tighten} with
 * the budget as the {@code maxChars} target. Returns a NEW
 * {@code RenderInput} with the tightened values in place.
 *
 * <p>All tighten calls fire in PARALLEL via {@code Promise.allSettled}.
 * Failures are logged and the original (over-budget) text passes
 * through unchanged — better an over-long page than no page. The
 * renderer's {@code overflow: hidden} on the page container is the
 * last-resort safety net.
 *
 * <p>{@link onProgress} is invoked once per resolved (or rejected)
 * tighten call so the UI can show a determinate progress bar during
 * what's typically a multi-second batch.
 */
export interface TightenPassOptions {
  language: LanguageCode;
  /** Optional callback fired with `(done, total)` after each settled
   *  tighten call. */
  onProgress?: (done: number, total: number) => void;
}

interface SlotRef {
  /** Direct mutation handle: pass the new value, hook updates the
   *  RenderInput in place. */
  set: (value: string) => void;
  get: () => string;
  budget: number;
  /** Stable label for logs / progress, e.g. `scenario[1].deck`. */
  scope: string;
}

function collectSlots(input: RenderInput): SlotRef[] {
  const slots: SlotRef[] = [];

  // Brief / metadata
  slots.push({
    scope: 'brief.challenge',
    budget: BUDGETS.briefChallenge,
    get: () => input.challenge,
    set: (v) => {
      input.challenge = v;
    },
  });
  slots.push({
    scope: 'brief.capabilities',
    budget: BUDGETS.briefCapabilities,
    get: () => input.capabilities,
    set: (v) => {
      input.capabilities = v;
    },
  });

  // Executive
  slots.push({
    scope: 'exec.deck',
    budget: BUDGETS.execDeck,
    get: () => input.execDeck,
    set: (v) => {
      input.execDeck = v;
    },
  });
  input.execParagraphs.forEach((_, i) => {
    slots.push({
      scope: `exec.paragraph[${i}]`,
      budget: BUDGETS.execParagraph,
      get: () => input.execParagraphs[i] ?? '',
      set: (v) => {
        input.execParagraphs[i] = v;
      },
    });
  });

  // STEEP
  input.steepDimensions.forEach((row, i) => {
    slots.push({
      scope: `steep[${row.key}].global`,
      budget: BUDGETS.steepGlobal,
      get: () => input.steepDimensions[i]?.global ?? '',
      set: (v) => {
        const r = input.steepDimensions[i];
        if (r) r.global = v;
      },
    });
    slots.push({
      scope: `steep[${row.key}].sectorial`,
      budget: BUDGETS.steepSectorial,
      get: () => input.steepDimensions[i]?.sectorial ?? '',
      set: (v) => {
        const r = input.steepDimensions[i];
        if (r) r.sectorial = v;
      },
    });
  });

  // Uncertainties
  input.uncertainties.forEach((_, i) => {
    slots.push({
      scope: `uncertainty[${i}].body`,
      budget: BUDGETS.uncertaintyBody,
      get: () => input.uncertainties[i]?.body ?? '',
      set: (v) => {
        const u = input.uncertainties[i];
        if (u) u.body = v;
      },
    });
  });

  // Scenarios
  input.scenarios.forEach((sc, i) => {
    slots.push({
      scope: `scenario[${i}].deck`,
      budget: BUDGETS.scenarioDeck,
      get: () => input.scenarios[i]?.deck ?? '',
      set: (v) => {
        const s = input.scenarios[i];
        if (s) s.deck = v;
      },
    });
    sc.paragraphs.forEach((_, p) => {
      slots.push({
        scope: `scenario[${i}].paragraph[${p}]`,
        budget: BUDGETS.scenarioBodyParagraph,
        get: () => input.scenarios[i]?.paragraphs[p] ?? '',
        set: (v) => {
          const s = input.scenarios[i];
          if (s) s.paragraphs[p] = v;
        },
      });
    });
    sc.opportunities.forEach((_, k) => {
      slots.push({
        scope: `scenario[${i}].opportunities[${k}]`,
        budget: BUDGETS.scenarioBullet,
        get: () => input.scenarios[i]?.opportunities[k] ?? '',
        set: (v) => {
          const s = input.scenarios[i];
          if (s) s.opportunities[k] = v;
        },
      });
    });
    sc.threats.forEach((_, k) => {
      slots.push({
        scope: `scenario[${i}].threats[${k}]`,
        budget: BUDGETS.scenarioBullet,
        get: () => input.scenarios[i]?.threats[k] ?? '',
        set: (v) => {
          const s = input.scenarios[i];
          if (s) s.threats[k] = v;
        },
      });
    });
    sc.successFactors.forEach((_, k) => {
      slots.push({
        scope: `scenario[${i}].successFactors[${k}]`,
        budget: BUDGETS.scenarioBullet,
        get: () => input.scenarios[i]?.successFactors[k] ?? '',
        set: (v) => {
          const s = input.scenarios[i];
          if (s) s.successFactors[k] = v;
        },
      });
    });
    slots.push({
      scope: `scenario[${i}].firstMove`,
      budget: BUDGETS.scenarioFirstMove,
      get: () => input.scenarios[i]?.firstMove ?? '',
      set: (v) => {
        const s = input.scenarios[i];
        if (s) s.firstMove = v;
      },
    });
  });

  // Backcasting matrix
  input.backcastingMatrix.rows.forEach((row, r) => {
    (['probable', 'plausible', 'possible'] as const).forEach((band) => {
      slots.push({
        scope: `backcasting[${row.year}].${band}.title`,
        budget: BUDGETS.backcastingCellTitle,
        get: () => input.backcastingMatrix.rows[r]?.[band].title ?? '',
        set: (v) => {
          const cell = input.backcastingMatrix.rows[r]?.[band];
          if (cell) cell.title = v;
        },
      });
      slots.push({
        scope: `backcasting[${row.year}].${band}.body`,
        budget: BUDGETS.backcastingCellBody,
        get: () => input.backcastingMatrix.rows[r]?.[band].body ?? '',
        set: (v) => {
          const cell = input.backcastingMatrix.rows[r]?.[band];
          if (cell) cell.body = v;
        },
      });
    });
  });
  slots.push({
    scope: 'backcasting.startingPoint',
    budget: BUDGETS.backcastingStartingPoint,
    get: () => input.backcastingStartingPoint,
    set: (v) => {
      input.backcastingStartingPoint = v;
    },
  });

  // Strategic map cards
  (['h1', 'h2', 'h3'] as const).forEach((key) => {
    const row = input.strategicMap[key];
    row.cards.forEach((_, c) => {
      row.cards[c]!.bullets.forEach((_b, b) => {
        slots.push({
          scope: `strategic[${key}][${c}].bullet[${b}]`,
          budget: BUDGETS.strategicCardBullet,
          get: () => input.strategicMap[key].cards[c]?.bullets[b] ?? '',
          set: (v) => {
            const card = input.strategicMap[key].cards[c];
            if (card) card.bullets[b] = v;
          },
        });
      });
    });
  });

  // Signals + wildcards
  input.signals.forEach((_, i) => {
    slots.push({
      scope: `signals[${i}].body`,
      budget: BUDGETS.signalBody,
      get: () => input.signals[i]?.body ?? '',
      set: (v) => {
        const s = input.signals[i];
        if (s) s.body = v;
      },
    });
  });
  input.wildcards.forEach((_, i) => {
    slots.push({
      scope: `wildcards[${i}].body`,
      budget: BUDGETS.wildcardBody,
      get: () => input.wildcards[i]?.body ?? '',
      set: (v) => {
        const w = input.wildcards[i];
        if (w) w.body = v;
      },
    });
  });

  return slots;
}

/**
 * Truncate at a word boundary as a last-resort fallback when the
 * tighten endpoint fails or is unavailable. Trims to the largest
 * complete-word prefix that fits under {@code max}, then appends an
 * ellipsis.
 */
function hardTruncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const cut = slice.lastIndexOf(' ');
  return (cut > max / 2 ? slice.slice(0, cut) : slice).trimEnd() + '…';
}

/**
 * Mutates {@code input} in place: every overshooting slot is replaced
 * with its tightened version (or a hard truncation if tighten fails).
 * Returns the same reference for callsite ergonomics.
 */
export async function runTightenPass(
  input: RenderInput,
  opts: TightenPassOptions,
): Promise<RenderInput> {
  const slots = collectSlots(input);
  const overshoots = slots.filter((s) => {
    const v = s.get();
    return typeof v === 'string' && v.length > s.budget;
  });
  if (overshoots.length === 0) return input;

  const total = overshoots.length;
  let done = 0;
  logger.debug(
    'pdf-v2',
    `tighten pre-pass: ${total} slot(s) over budget`,
    overshoots.map((s) => `${s.scope}=${s.get().length}/${s.budget}`),
  );

  const tasks = overshoots.map(async (slot) => {
    const original = slot.get();
    try {
      const next = await tighten({
        text: original,
        targetChars: slot.budget,
        language: opts.language,
      });
      // Tighten can come back longer than the target if the model
      // refused to drop content. Fall back to a hard truncation only
      // when it would still overflow the page.
      if (next.length <= slot.budget) {
        slot.set(next);
      } else {
        slot.set(hardTruncate(next, slot.budget));
      }
    } catch (err) {
      logger.warn('pdf-v2', `tighten failed for ${slot.scope}; hard-truncating`, err);
      slot.set(hardTruncate(original, slot.budget));
    } finally {
      done += 1;
      opts.onProgress?.(done, total);
    }
  });

  await Promise.allSettled(tasks);
  return input;
}
