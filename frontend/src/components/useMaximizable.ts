import { useCallback, useEffect, useState } from 'react';

/**
 * Tracks which card (if any) is currently maximised to fullscreen for
 * easier editing. While a card is active:
 *   - `body.has-maximized` is set so wizard.css can lock document scroll
 *   - Escape closes the maximised view
 *
 * Pages render a `.maximize-backdrop` and conditionally apply `.maximized`
 * to the active card themselves; this hook only owns the state + side
 * effects. Reusable across StepGlobal, StepSteep, StepHorizon.
 */
export function useMaximizable<K extends string>() {
  const [activeKey, setActiveKey] = useState<K | null>(null);

  const minimize = useCallback(() => setActiveKey(null), []);
  const toggle = useCallback(
    (k: K) => setActiveKey((cur) => (cur === k ? null : k)),
    [],
  );
  const isMaximized = useCallback((k: K) => activeKey === k, [activeKey]);

  useEffect(() => {
    if (!activeKey) return;
    document.body.classList.add('has-maximized');
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setActiveKey(null);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('has-maximized');
      document.removeEventListener('keydown', onKey);
    };
  }, [activeKey]);

  return { activeKey, isMaximized, toggle, minimize };
}
