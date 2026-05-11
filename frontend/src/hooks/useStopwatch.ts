import { useEffect, useRef, useState } from 'react';

/**
 * MM:SS elapsed counter that ticks once per second while `running` is true.
 * Resets to 00:00 every time `running` flips from false → true so each
 * loading flow starts from zero.
 */
export function useStopwatch(running: boolean): string {
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      startedAt.current = null;
      setSeconds(0);
      return;
    }
    startedAt.current = Date.now();
    setSeconds(0);
    const id = window.setInterval(() => {
      if (startedAt.current === null) return;
      setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
