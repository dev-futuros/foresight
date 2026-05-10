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
  // Display numbers derive from array position, not `s.n` — that lets a page
  // skip a step internally (e.g. the wizard's transient "Analysis" loader,
  // which is step 5 in code but is omitted from the stepper array) without
  // leaving a numeric gap in the visible bar. `s.n` is preserved as the
  // routing identity for `current`, `maxReached` and `onSelect`.
  const activeIndex = steps.findIndex((s) => s.n === current);
  const activeStep = activeIndex >= 0 ? steps[activeIndex] : steps[0];
  const displayCurrent = activeIndex >= 0 ? activeIndex + 1 : 1;
  const progressPct = total > 0 ? (displayCurrent / total) * 100 : 0;
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
          {steps.map((s, idx) => {
            const status = statusFor(s.n);
            // A step is interactive only if (a) the page wired up an onSelect,
            // (b) the step is in the "done" lane, and (c) the step itself
            // hasn't opted out via `clickable: false`.
            const clickable =
              s.clickable !== false &&
              status === 'done' &&
              typeof onSelect === 'function';
            return (
              <li
                key={s.n}
                className={`stepper-item ${status}${clickable ? ' clickable' : ''}`}
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
                <span className="stepper-num">{idx + 1}</span>
                <span>{s.label}</span>
              </li>
            );
          })}
        </ol>

        {/* Mobile compact */}
        <div className="stepper-mobile">
          <span className="stepper-mobile-num">
            {String(displayCurrent).padStart(2, '0')} / {String(total).padStart(2, '0')}
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
