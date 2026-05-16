import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './infoTooltip.css';

/**
 * Compact (i) trigger that reveals an explanatory bubble on hover, focus
 * or tap. Used next to model-computed values (e.g. scenario probability,
 * driving-force impact score) so the user can see where the number
 * comes from without cluttering the visual with paragraph-long captions.
 *
 * <p>The bubble is portaled into `document.body` with `position: fixed`
 * coordinates derived from the trigger's bounding rect. That sidesteps
 * any ancestor `overflow: hidden` (common on cards with rounded stripes)
 * that would otherwise clip the bubble.
 *
 * <p>Auto-flips above ↔ below based on available viewport room so the
 * bubble doesn't slide off the top of the screen near the page header.
 */
export default function InfoTooltip({ text }: { text: string }) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const visible = open || hover;
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    placement: 'top' | 'bottom';
  } | null>(null);

  // Recompute position whenever the bubble becomes visible. Read the
  // trigger rect, then on the next layout pass read the bubble rect to
  // place it precisely centered + flipped if it would overflow above.
  useLayoutEffect(() => {
    if (!visible || !triggerRef.current) {
      setPos(null);
      return;
    }
    const r = triggerRef.current.getBoundingClientRect();
    const initialTop = r.top - 8;
    setPos({ top: initialTop, left: r.left + r.width / 2, placement: 'top' });
  }, [visible]);

  // After the bubble renders, measure it and clamp to viewport. Flips
  // below the trigger if the bubble would clip the top edge.
  useEffect(() => {
    if (!visible || !pos || !bubbleRef.current || !triggerRef.current) return;
    const bubble = bubbleRef.current.getBoundingClientRect();
    const trigger = triggerRef.current.getBoundingClientRect();
    const wantsFlip = trigger.top - bubble.height - 12 < 0;
    const placement: 'top' | 'bottom' = wantsFlip ? 'bottom' : 'top';
    const top = placement === 'top' ? trigger.top - 8 : trigger.bottom + 8;
    let left = trigger.left + trigger.width / 2;
    // Clamp horizontally so the bubble stays inside the viewport.
    const halfW = bubble.width / 2;
    const minX = 8 + halfW;
    const maxX = window.innerWidth - 8 - halfW;
    if (left < minX) left = minX;
    if (left > maxX) left = maxX;
    if (
      pos.placement !== placement ||
      Math.abs(pos.top - top) > 0.5 ||
      Math.abs(pos.left - left) > 0.5
    ) {
      setPos({ top, left, placement });
    }
  }, [visible, pos]);

  // Close on Escape so keyboard users can dismiss the click-opened bubble.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <span className="info-tip">
      <button
        ref={triggerRef}
        type="button"
        className="info-tip-trigger"
        aria-label={text}
        aria-expanded={open}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => {
          setHover(false);
          setOpen(false);
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((p) => !p);
        }}
      >
        <svg viewBox="0 0 12 12" aria-hidden>
          <circle cx={6} cy={6} r={5} fill="none" stroke="currentColor" strokeWidth={1.2} />
          <circle cx={6} cy={3.4} r={0.7} fill="currentColor" />
          <path d="M6 5.4 L6 9" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
        </svg>
      </button>
      {visible && pos &&
        createPortal(
          <div
            ref={bubbleRef}
            className={`info-tip-bubble info-tip-bubble--${pos.placement}`}
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}
