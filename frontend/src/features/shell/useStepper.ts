import { createContext, useContext, useEffect } from 'react';

/**
 * Stepper "slot" wired into AppShell. Wizard pages declaratively register
 * their step state via useSetStepper(...); AppShell reads it and renders
 * the sticky <Stepper /> only when a slot is present.
 */
export interface StepperStep {
  n: number;
  label: string;
  /** Set to false to keep this step visible in the bar but non-interactive
   *  (no click handler, no hover/cursor cue). Useful for "marker-only"
   *  steps like an analysis loading screen that aren't real pages. */
  clickable?: boolean;
}

export interface StepperState {
  steps: StepperStep[];
  current: number;
  /**
   * Highest step number the user has ever reached. Steps with n <= maxReached
   * (and n !== current) are clickable in both directions. If omitted, only
   * past steps (n < current) are clickable — back-only navigation.
   */
  maxReached?: number;
  onSelect?: (n: number) => void;
}

export interface StepperContextValue {
  state: StepperState | null;
  setState: (s: StepperState | null) => void;
}

export const StepperContext = createContext<StepperContextValue | null>(null);

/** Read the current stepper slot. AppShell uses this to decide whether to render. */
export function useStepperSlot(): StepperState | null {
  const ctx = useContext(StepperContext);
  return ctx?.state ?? null;
}

/**
 * Wizard pages call this to push their step state up to the shell.
 * Automatically clears the slot on unmount so non-wizard pages don't show a
 * stale stepper.
 *
 * The caller MUST memoise `state` (typically with useMemo on [steps, current])
 * so the effect doesn't re-fire on every render. Passing a fresh object each
 * render would trigger an infinite update loop via the provider's setState.
 */
export function useSetStepper(state: StepperState | null) {
  const ctx = useContext(StepperContext);
  const setState = ctx?.setState;
  useEffect(() => {
    if (!setState) return;
    setState(state);
    return () => setState(null);
  }, [state, setState]);
}
