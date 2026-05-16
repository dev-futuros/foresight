import { createContext, useContext } from 'react';

/**
 * Shared snapshot of "what the user is currently looking at" so the chat
 * assistant can answer questions about it without the user having to repeat
 * himself.
 *
 * Concretely it carries the wizard's form state (when the user is on a
 * wizard page) or the report id + summary (when on the report viewer). The
 * snapshot is JSON-serialisable because it ends up stitched into the system
 * prompt verbatim.
 *
 * Contributing pages call `setContext(...)` from a useEffect on mount; the
 * cleanup resets to undefined so stale context doesn't bleed into the next
 * page. This keeps the wiring opt-in: features that want to teach the
 * assistant about themselves do so explicitly.
 */
export interface AssistantContextShape {
  /** JSON-friendly snapshot — current step, form values, current report id. */
  context: unknown;
  setContext: (next: unknown) => void;
}

export const AssistantCtx = createContext<AssistantContextShape | null>(null);

/** Used by the chat panel — returns the JSON snapshot, or `undefined` when
 *  no page has contributed any. */
export function useAssistantContext(): unknown {
  const c = useContext(AssistantCtx);
  return c?.context;
}

/** Setter for pages that want to publish their state to the assistant. */
export function useSetAssistantContext(): (next: unknown) => void {
  const c = useContext(AssistantCtx);
  if (!c) {
    // Most code paths import this through AppShell which provides the ctx.
    // A no-op in non-shell paths (e.g. /share/:token public view) keeps the
    // setter call site free of conditionals.
    return () => {};
  }
  return c.setContext;
}
