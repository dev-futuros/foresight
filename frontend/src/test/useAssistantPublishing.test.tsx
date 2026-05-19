import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const setAssistantContextMock = vi.fn();
vi.mock('../features/chat/useAssistantContext', () => ({
  useSetAssistantContext: () => setAssistantContextMock,
}));

import { useAssistantPublishing } from '../features/report/hooks/useAssistantPublishing';

beforeEach(() => {
  setAssistantContextMock.mockReset();
});

describe('useAssistantPublishing', () => {
  it('publishes the snapshot on mount', () => {
    const snapshot = { currentStep: 2, foo: 'bar' };
    renderHook(() => useAssistantPublishing(snapshot));
    // StrictMode-free renderHook → exactly one mount-publish.
    expect(setAssistantContextMock).toHaveBeenCalledWith(snapshot);
  });

  it('re-publishes when the snapshot identity changes', () => {
    const first = { currentStep: 1 };
    const second = { currentStep: 2 };
    const { rerender } = renderHook((s: unknown) => useAssistantPublishing(s), {
      initialProps: first,
    });
    expect(setAssistantContextMock).toHaveBeenLastCalledWith(first);

    rerender(second);
    expect(setAssistantContextMock).toHaveBeenLastCalledWith(second);
  });

  it('does NOT re-publish when the same snapshot reference is passed', () => {
    const snapshot = { currentStep: 1 };
    const { rerender } = renderHook((s: unknown) => useAssistantPublishing(s), {
      initialProps: snapshot,
    });
    setAssistantContextMock.mockClear();
    rerender(snapshot);
    expect(setAssistantContextMock).not.toHaveBeenCalled();
  });

  it('clears the assistant context on unmount', () => {
    const { unmount } = renderHook(() => useAssistantPublishing({ currentStep: 1 }));
    setAssistantContextMock.mockClear();
    unmount();
    expect(setAssistantContextMock).toHaveBeenCalledWith(undefined);
    // Exactly one call, the unmount-clear — no symmetric "clear on
    // dep-change" leaks through. The whole point of the dedicated
    // unmount-only effect is to avoid that.
    expect(setAssistantContextMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT clear on snapshot change (only on unmount)', () => {
    const { rerender } = renderHook((s: unknown) => useAssistantPublishing(s), {
      initialProps: { currentStep: 1 },
    });
    setAssistantContextMock.mockClear();
    rerender({ currentStep: 2 });
    // One re-publish, no undefined-clear sandwiched between.
    expect(setAssistantContextMock).toHaveBeenCalledTimes(1);
    expect(setAssistantContextMock.mock.calls[0]?.[0]).toEqual({ currentStep: 2 });
  });
});
