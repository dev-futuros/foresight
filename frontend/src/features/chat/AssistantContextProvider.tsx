import { useMemo, useState, type ReactNode } from 'react';
import { AssistantCtx } from './useAssistantContext';

export function AssistantContextProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<unknown>(undefined);
  const value = useMemo(() => ({ context, setContext }), [context]);
  return <AssistantCtx.Provider value={value}>{children}</AssistantCtx.Provider>;
}
