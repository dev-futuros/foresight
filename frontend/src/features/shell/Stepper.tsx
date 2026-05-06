import type { StepperState } from './StepperContext';

type Props = {
  state: StepperState;
};

/**
 * Sticky step indicator — desktop list + mobile compact bar.
 * Markup mirrors the prototype's `.stepper` block.
 *
 * Steps with `n < current` are clickable (state="done") to jump back, only
 * if the page passed an `onSelect` handler. The active step is highlighted
 * in gold; future steps are muted.
 */
export default function Stepper({ state }: Props) {
  const { steps, current, maxReached, onSelect } = state;
  const total = steps.length;
  const activeStep = steps.find((s) => s.n === current) ?? steps[0];
  const progressPct = total > 0 ? (current / total) * 100 : 0;
  // Default to back-only navigation when the page hasn't supplied maxReached.
  const reached = maxReached ?? current;

  function statusFor(n: number): 'done' | 'active' | 'pending' {
    if (n === current) return 'active';
    if (n <= reached) return 'done';
    return 'pending';
  }

  return (
    <nav className="stepper" aria-label="Foresight steps">
      <div className="stepper-inner">
        {/* Desktop list */}
        <ol className="stepper-list">
          {steps.map((s) => {
            const status = statusFor(s.n);
            const clickable = status === 'done' && typeof onSelect === 'function';
            return (
              <li
                key={s.n}
                className={`stepper-item ${status}`}
                onClick={clickable ? () => onSelect!(s.n) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelect!(s.n);
                        }
                      }
                    : undefined
                }
                tabIndex={clickable ? 0 : -1}
                role={clickable ? 'button' : undefined}
                aria-current={status === 'active' ? 'step' : undefined}
              >
                <span className="stepper-num">{s.n}</span>
                <span>{s.label}</span>
              </li>
            );
          })}
        </ol>

        {/* Mobile compact */}
        <div className="stepper-mobile">
          <span className="stepper-mobile-num">
            {String(current).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
          <span className="stepper-mobile-label">{activeStep.label}</span>
          <div className="stepper-bar">
            <div className="stepper-bar-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>
    </nav>
  );
}
