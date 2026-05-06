import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Stepper "slot" wired into AppShell. Wizard pages declaratively register
 * their step state via useSetStepper(...); AppShell reads it and renders
 * the sticky <Stepper /> only when a slot is present.
 */
export type StepperStep = { n: number; label: string };

export type StepperState = {
  steps: StepperStep[];
  current: number;
  /**
   * Highest step number the user has ever reached. Steps with n <= maxReached
   * (and n !== current) are clickable in both directions. If omitted, only
   * past steps (n < current) are clickable — back-only navigation.
   */
  maxReached?: number;
  onSelect?: (n: number) => void;
};

type StepperContextValue = {
  state: StepperState | null;
  setState: (s: StepperState | null) => void;
};

const StepperContext = createContext<StepperContextValue | null>(null);

export function StepperProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StepperState | null>(null);
  const value = useMemo(() => ({ state, setState }), [state]);
  return <StepperContext.Provider value={value}>{children}</StepperContext.Provider>;
}

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
