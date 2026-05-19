import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Status machine for a single autosaved document.
 *
 * <ul>
 *   <li>{@code idle} — initial state; no changes since mount (or since
 *       the last successful save).</li>
 *   <li>{@code dirty} — the user typed something the server doesn't have
 *       yet. A debounced save is scheduled.</li>
 *   <li>{@code saving} — the persist call is in flight.</li>
 *   <li>{@code saved} — the most recent persist resolved.
 *       {@link UseAutosaveReturn.lastSavedAt} reflects the moment it
 *       landed.</li>
 *   <li>{@code error} — the most recent persist rejected. The next user
 *       change flips back to {@code dirty} and reschedules.</li>
 * </ul>
 */
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface UseAutosaveOptions {
  /**
   * Single persist callback the hook fires when a save lands. The
   * caller decides POST-vs-PATCH internally (we don't want the hook to
   * know about HTTP). Resolve on success; reject to flip status to
   * {@code error}.
   */
  persist: () => Promise<void>;
  /**
   * Reactive dependency array — changes after {@link enabled} flips
   * true mark the doc dirty and schedule a debounced save. Pass the
   * wizard state slices: when the user edits a field, React re-renders
   * with a new value and this hook's effect re-runs.
   */
  values: readonly unknown[];
  /**
   * False while the document is in the initial prefill phase — the
   * caller is still assigning React state from an API response and
   * those assignments shouldn't be treated as user edits. Flip to true
   * once prefill completes; subsequent value changes are then the only
   * ones the debouncer sees.
   */
  enabled: boolean;
  /**
   * When true, value changes still flip the doc dirty but the
   * debounced save scheduler is paused — useful for running expensive
   * pipelines (analysis, AI generation) that mustn't race a draft
   * PATCH. The pending save fires automatically when paused goes
   * false (the value-change effect re-runs because {@code paused} is
   * one of the deps).
   */
  paused?: boolean;
  /**
   * Return false to skip the next save without changing status. Used
   * for example mode (read-only content) and the "no meaningful
   * content yet" gate. Read every time a save is about to fire, so
   * it can close over fresh refs.
   */
  shouldSave?: () => boolean;
  /**
   * Debounce window in milliseconds. Long enough to coalesce a
   * paragraph of typing into one PATCH, short enough that "Saved"
   * lands within a reasonable expectation of "I just stopped typing".
   */
  debounceMs?: number;
}

export interface UseAutosaveReturn {
  status: SaveStatus;
  lastSavedAt: Date | null;
  /**
   * Cancels any pending debounce and fires the save immediately when
   * status is {@code dirty}. Resolves when the (now-running) save
   * completes. No-op when status isn't dirty — avoids issuing a
   * redundant PATCH on every step transition.
   */
  flush: () => Promise<void>;
}

const DEFAULT_DEBOUNCE_MS = 1500;

/**
 * Debounced autosave state machine for a single document.
 *
 * <p>Coalesces a paragraph of fast typing into one persist call,
 * guards against overlapping saves (if a save is already in flight,
 * marks the doc still-dirty and lets the next debounce pick it up),
 * and exposes a {@code flush()} the caller can invoke on step
 * transitions / unmount to commit pending edits immediately.
 *
 * <p>Persistence policy is the caller's responsibility — they pass a
 * {@link UseAutosaveOptions.persist} callback that knows how to build
 * the snapshot and decide POST-vs-PATCH. This hook just owns the
 * timing + status machine.
 *
 * <p>Unmount semantics: the pending timer is cancelled, and if the
 * doc is dirty at unmount the persist call is fired one last time
 * (fire-and-forget — the fetch outlives the React tree teardown).
 */
export function useAutosave(options: UseAutosaveOptions): UseAutosaveReturn {
  const {
    persist,
    values,
    enabled,
    paused = false,
    shouldSave,
    debounceMs = DEFAULT_DEBOUNCE_MS,
  } = options;

  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Refs flush() / unmount cleanup read without becoming render-time
  // deps (which would re-create flush on every keystroke and cascade
  // through useCallback dependents).
  const statusRef = useRef<SaveStatus>(status);
  const debounceTimerRef = useRef<number | null>(null);
  const inflightRef = useRef<boolean>(false);
  /**
   * Flipped true by the watch effect whenever a value change happens
   * while a save is in flight. Read at the tail of {@link runSave}: if
   * true, the save resolves into 'dirty' (a newer edit needs to be
   * persisted) rather than 'saved'. Avoids reading {@link statusRef}
   * for the same signal — React doesn't commit setStatus before the
   * await resumes for already-resolved promises, so the ref is stale
   * at that point.
   */
  const dirtyDuringSaveRef = useRef<boolean>(false);
  const persistRef = useRef(persist);
  const shouldSaveRef = useRef(shouldSave);

  // Mirror status into a ref every render so flush() / unmount can
  // read the freshest value without taking `status` as a dep.
  useEffect(() => {
    statusRef.current = status;
  });

  // Mirror the persist / shouldSave callbacks so the hook always uses
  // the latest closure without re-creating the watch effect.
  useEffect(() => {
    persistRef.current = persist;
    shouldSaveRef.current = shouldSave;
  });

  const runSave = useCallback(async () => {
    if (shouldSaveRef.current && !shouldSaveRef.current()) return;
    // In-flight guard: if a save is already running, mark the doc
    // still-dirty via the ref the running save reads on resume. The
    // currently-running save resolves first; this signal makes it land
    // on 'dirty' instead of 'saved'.
    if (inflightRef.current) {
      dirtyDuringSaveRef.current = true;
      setStatus('dirty');
      return;
    }
    inflightRef.current = true;
    dirtyDuringSaveRef.current = false;
    setStatus('saving');
    try {
      await persistRef.current();
      if (dirtyDuringSaveRef.current) {
        // A change landed during the save; honour it. The scheduled
        // timer (set by the value-change watch effect) will pick the
        // newer state up after the next debounce window.
        setStatus('dirty');
      } else {
        setStatus('saved');
        setLastSavedAt(new Date());
      }
    } catch {
      // Caller's persist already logs; status flip is all we need here.
      setStatus('error');
    } finally {
      inflightRef.current = false;
      dirtyDuringSaveRef.current = false;
    }
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (statusRef.current !== 'dirty') return;
    await runSave();
  }, [runSave]);

  // ── The watch effect ─────────────────────────────────────────────
  // Fires on every value change (after enabled flips true). Marks the
  // doc dirty and (re)schedules a debounced save. The next change
  // before the timer fires cancels and reschedules, so a paragraph of
  // typing coalesces into one save.
  //
  // The eslint deps comment is intentional: spreading `values` is the
  // whole point of this hook — callers pass their state slices and
  // expect the watch to fire when any of them change.
  useEffect(() => {
    if (!enabled) return;
    setStatus('dirty');
    // If a save is currently in flight, flag the dirty-during-save
    // signal so the running save lands on 'dirty' instead of 'saved'
    // when it resolves. The scheduled timer (below) takes care of
    // persisting the newer state.
    if (inflightRef.current) {
      dirtyDuringSaveRef.current = true;
    }
    // Always cancel any pending timer at this point. We either
    // reschedule it below (default path) or we're paused / about to
    // unmount and the previous timer must not leak through.
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (paused) return;
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void runSave();
    }, debounceMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, paused, debounceMs, runSave, ...values]);

  // Unmount cleanup: cancel the timer; fire one last save if dirty.
  // Fire-and-forget — the fetch is queued before React tears down,
  // and fetch() requests survive unmount.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (statusRef.current === 'dirty') {
        void runSave();
      }
    };
  }, [runSave]);

  return { status, lastSavedAt, flush };
}
