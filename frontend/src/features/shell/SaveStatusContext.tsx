import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Shape of the autosave indicator. Pages with autosaving state (currently
 * only {@code NewReportPage}) publish via {@link useSetSaveStatus}; the
 * top bar reads via {@link useSaveStatus} and renders the chip inline with
 * its other action icons. Lives in shell-land because the indicator is
 * shell chrome — same lifetime as the topbar — even though the *source*
 * of the status is page-local.
 *
 * <p>Status semantics mirror {@code NewReportPage}'s state machine:
 * <ul>
 *   <li>{@code dirty}: typed but not yet persisted
 *   <li>{@code saving}: PATCH in flight
 *   <li>{@code saved}: persisted; relative-time label refreshes via {@code label}
 *   <li>{@code error}: PATCH failed; the user should know the last keystrokes
 *       aren't in the DB
 * </ul>
 * The {@code label} is the localised, time-sensitive copy the page assembles
 * (e.g. "Saved 32s ago"). Shell-land doesn't re-format — it just renders
 * what's published.
 */
export type SaveStatusKind = 'dirty' | 'saving' | 'saved' | 'error';

export interface SaveStatusValue {
  status: SaveStatusKind;
  /** Localised tooltip / a11y copy. */
  label: string;
}

interface Ctx {
  value: SaveStatusValue | null;
  setValue: (next: SaveStatusValue | null) => void;
}

const SaveStatusCtx = createContext<Ctx | null>(null);

export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<SaveStatusValue | null>(null);
  const ctx = useMemo(() => ({ value, setValue }), [value]);
  return <SaveStatusCtx.Provider value={ctx}>{children}</SaveStatusCtx.Provider>;
}

/** Consumer side — TopBar reads this. {@code null} when no autosaving page
 *  is mounted (dashboard, account, share view, etc.) so the chip is hidden. */
export function useSaveStatus(): SaveStatusValue | null {
  const c = useContext(SaveStatusCtx);
  return c?.value ?? null;
}

/** Publisher side — wizard pages call this from a useEffect that watches
 *  their save state. Setting {@code null} clears the chip. */
export function useSetSaveStatus(): (next: SaveStatusValue | null) => void {
  const c = useContext(SaveStatusCtx);
  if (!c) {
    // No-op outside the shell (e.g. /share/:token public view) so callers
    // don't need a conditional.
    return () => {};
  }
  return c.setValue;
}
