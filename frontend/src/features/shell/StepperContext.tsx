import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { StepperContext, type StepperState } from './useStepper';

export function StepperProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StepperState | null>(null);
  const value = useMemo(() => ({ state, setState }), [state]);
  return <StepperContext.Provider value={value}>{children}</StepperContext.Provider>;
}
