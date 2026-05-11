import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  /**
   * Number of visible lines before truncation. Defaults to 3.
   * Passed through to {@code -webkit-line-clamp} via a CSS custom property.
   */
  lines?: number;
  /**
   * Extra classes for the outer container — typography, color, borders,
   * padding etc. land here so the consumer can fold {@code LineClamp}
   * into existing styled blocks (e.g. .exec-summary) without forking
   * the look.
   */
  className?: string;
  children: ReactNode;
}

/**
 * Progressive-disclosure primitive for long prose. Renders the children
 * with a {@code -webkit-line-clamp} cap (3 lines by default); when the
 * content actually overflows the clamp, a "Read more / less" toggle is
 * shown below it. Resize-aware via {@code ResizeObserver} so the toggle
 * (dis)appears as the column width changes.
 *
 * <p>Used across the report tabs to tame long model-generated paragraphs
 * — executive summary, scenario description, axis rationale, milestone
 * description — without throwing away the prose. The user keeps the
 * scannable preview by default and opens what they care about.
 *
 * <p>Note: {@code white-space} is inherited, so a parent setting
 * {@code white-space: pre-line} (e.g. the exec-summary block, which
 * needs to honour {@code \n\n} paragraph breaks from the model) is
 * preserved through the clamped element.
 */
export default function LineClamp({ lines = 3, className, children }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  // Sticky "is this content tall enough to need a toggle?" flag. Once it
  // flips true while collapsed it stays true through expand/collapse
  // cycles, so we don't briefly hide the "Read less" button while the
  // expanded box measures clientHeight === scrollHeight.
  const [overflows, setOverflows] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only measure while collapsed — when expanded, scrollHeight equals
    // clientHeight by definition (no overflow), so re-measuring would
    // spuriously hide the toggle. The `expanded` reset path below makes
    // sure we re-measure if content changes while expanded.
    if (expanded) return;
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      // +1 forgives sub-pixel rounding (browsers occasionally report
      // scrollHeight === clientHeight + 0.5 even for un-clamped content).
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, lines, children]);

  return (
    <div className={['line-clamp', className].filter(Boolean).join(' ')}>
      <div
        ref={contentRef}
        className={`line-clamp-content${expanded ? ' line-clamp-content--expanded' : ''}`}
        // Custom property is read by `.line-clamp-content`'s -webkit-line-clamp rule.
        style={{ ['--lc-lines' as string]: lines } as CSSProperties}
      >
        {children}
      </div>
      {overflows && (
        <button
          type="button"
          className="line-clamp-toggle"
          onClick={() => setExpanded((p) => !p)}
          aria-expanded={expanded}
        >
          {expanded ? t('common.readLess') : t('common.readMore')}
        </button>
      )}
    </div>
  );
}
