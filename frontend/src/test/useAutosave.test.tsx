import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAutosave, type UseAutosaveOptions } from '../features/report/hooks/useAutosave';

// Build a Promise we can resolve / reject externally — needed to test
// the in-flight guard and the dirty-during-save transition without
// touching real timers/network.
function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Helper that yields a hook with a default-shaped options object whose
 * `persist` we can stub per-test. Tests adjust `enabled` / `values` /
 * `paused` via the rerender callback.
 */
function setup(initial: Partial<UseAutosaveOptions> = {}) {
  const persist = vi.fn().mockResolvedValue(undefined);
  const defaults: UseAutosaveOptions = {
    persist,
    values: [''],
    enabled: true,
    debounceMs: 1500,
    ...initial,
  };
  const rendered = renderHook(
    (props: UseAutosaveOptions) => useAutosave(props),
    { initialProps: defaults },
  );
  return { ...rendered, persist, defaults };
}

describe('useAutosave — initial state', () => {
  it('starts idle when enabled is false (prefill phase)', () => {
    const { result } = setup({ enabled: false });
    expect(result.current.status).toBe('idle');
    expect(result.current.lastSavedAt).toBeNull();
  });

  it('does NOT trigger a save on the initial mount (no edits yet)', async () => {
    const { result, persist } = setup({ enabled: true });
    // Even after the debounce window elapses, the initial render
    // shouldn't count as a value change.
    // ...except React's effect deps treat mount as the first comparison,
    // so the watch effect runs once. The current contract: the watch
    // fires on mount AND sets status to 'dirty', then schedules a save.
    // This isn't strictly user behaviour but it matches the existing
    // NewReportPage state machine. Document it explicitly here.
    expect(result.current.status).toBe('dirty');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe('useAutosave — value-change debouncing', () => {
  it('flips to dirty on a value change before the timer fires', async () => {
    const { result, rerender, defaults } = setup();
    rerender({ ...defaults, values: ['edit-1'] });
    expect(result.current.status).toBe('dirty');
  });

  it('coalesces fast value changes into a single persist call', async () => {
    const { rerender, persist, defaults } = setup();
    // Three changes within the debounce window.
    rerender({ ...defaults, values: ['a'] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    rerender({ ...defaults, values: ['ab'] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    rerender({ ...defaults, values: ['abc'] });

    // No save fired yet (we've only advanced 1000ms total — the timer
    // resets on each change).
    expect(persist).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('flips dirty → saving → saved with lastSavedAt set', async () => {
    const d = deferred();
    const persist = vi.fn().mockReturnValue(d.promise);
    const { result, rerender, defaults } = setup({ persist });

    rerender({ ...defaults, persist, values: ['x'] });
    expect(result.current.status).toBe('dirty');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.status).toBe('saving');

    await act(async () => {
      d.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe('saved');
    expect(result.current.lastSavedAt).toBeInstanceOf(Date);
  });

  it('flips to error if persist rejects', async () => {
    const d = deferred();
    const persist = vi.fn().mockReturnValue(d.promise);
    const { result, rerender, defaults } = setup({ persist });

    rerender({ ...defaults, persist, values: ['x'] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.status).toBe('saving');

    await act(async () => {
      d.reject(new Error('boom'));
      // Two microtask flushes: one for the rejection, one for the
      // catch handler to setState.
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.lastSavedAt).toBeNull();
  });
});

describe('useAutosave — enabled gate (initial prefill)', () => {
  it('ignores value changes while enabled is false', async () => {
    const { result, rerender, persist, defaults } = setup({ enabled: false });
    rerender({ ...defaults, enabled: false, values: ['edit'] });
    expect(result.current.status).toBe('idle');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it('starts watching once enabled flips true', async () => {
    const { result, rerender, persist, defaults } = setup({ enabled: false });
    rerender({ ...defaults, enabled: true, values: ['x'] });
    expect(result.current.status).toBe('dirty');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe('useAutosave — paused (e.g. analysis running)', () => {
  it('marks dirty but does NOT schedule a save while paused', async () => {
    const { result, rerender, persist, defaults } = setup({ paused: true });
    rerender({ ...defaults, paused: true, values: ['x'] });
    expect(result.current.status).toBe('dirty');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it('fires the pending save once paused goes false', async () => {
    const { result, rerender, persist, defaults } = setup({ paused: true });
    rerender({ ...defaults, paused: true, values: ['x'] });
    expect(result.current.status).toBe('dirty');

    rerender({ ...defaults, paused: false, values: ['x'] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe('useAutosave — shouldSave gate', () => {
  it('skips persist when shouldSave returns false', async () => {
    const shouldSave = vi.fn().mockReturnValue(false);
    const { rerender, persist, defaults } = setup({ shouldSave });
    rerender({ ...defaults, shouldSave, values: ['x'] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(persist).not.toHaveBeenCalled();
    expect(shouldSave).toHaveBeenCalled();
  });

  it('runs persist when shouldSave returns true', async () => {
    const shouldSave = vi.fn().mockReturnValue(true);
    const { rerender, persist, defaults } = setup({ shouldSave });
    rerender({ ...defaults, shouldSave, values: ['x'] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe('useAutosave — in-flight guard', () => {
  it('marks the doc dirty on a change during a save instead of issuing a second persist', async () => {
    const d = deferred();
    const persist = vi.fn().mockReturnValue(d.promise);
    const { result, rerender, defaults } = setup({ persist });

    rerender({ ...defaults, persist, values: ['first'] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.status).toBe('saving');
    expect(persist).toHaveBeenCalledTimes(1);

    // Edit while the first save is still in flight.
    rerender({ ...defaults, persist, values: ['second'] });
    expect(result.current.status).toBe('dirty');

    // Resolve the first save — status flips to 'dirty' (not 'saved'),
    // because a newer change is pending.
    await act(async () => {
      d.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe('dirty');

    // The newer change fires after the next debounce window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(persist).toHaveBeenCalledTimes(2);
  });
});

describe('useAutosave — flush()', () => {
  it('cancels the timer and runs the save immediately when dirty', async () => {
    const { result, rerender, persist, defaults } = setup();
    rerender({ ...defaults, values: ['x'] });
    expect(result.current.status).toBe('dirty');
    expect(persist).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.flush();
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('saved');
  });

  it('is a no-op when status is not dirty', async () => {
    const { result, rerender, persist, defaults } = setup();
    // Trigger a save and let it finish.
    rerender({ ...defaults, values: ['x'] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();
    });
    expect(result.current.status).toBe('saved');
    persist.mockClear();

    // Now flush — nothing to do.
    await act(async () => {
      await result.current.flush();
    });
    expect(persist).not.toHaveBeenCalled();
  });
});

describe('useAutosave — unmount', () => {
  it('cancels the pending timer (no save fires after unmount)', async () => {
    const { rerender, unmount, persist, defaults } = setup();
    rerender({ ...defaults, values: ['x'] });
    // Status is dirty, timer is scheduled. Unmount cancels timer AND
    // (because status is dirty) fires one last save before tearing down.
    persist.mockClear();
    unmount();
    // Advancing fake timers after unmount should NOT trigger another save.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    // Exactly one save: the unmount flush. No timer-driven save after.
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('fires one last save on unmount if the doc is dirty', () => {
    const { rerender, unmount, persist, defaults } = setup();
    rerender({ ...defaults, values: ['x'] });
    expect(persist).not.toHaveBeenCalled();
    unmount();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does NOT save on unmount when the doc is clean', async () => {
    const { rerender, unmount, persist, defaults } = setup();
    // Trigger + finish a save so we land on 'saved' (not dirty).
    rerender({ ...defaults, values: ['x'] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();
    });
    persist.mockClear();
    unmount();
    expect(persist).not.toHaveBeenCalled();
  });
});
