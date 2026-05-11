import Modal from './Modal';

type Props = {
  open: boolean;
  /** Caption shown beneath the spinner (mono uppercase, gold). */
  text: string;
  /** Optional ARIA label; defaults to the caption text. */
  ariaLabel?: string;
  /**
   * When set, renders a determinate progress bar below the caption.
   * Value is clamped to [0, 100]. Pass {@code null}/{@code undefined}
   * to fall back to the indeterminate spinner-only layout.
   */
  progressPct?: number | null;
  /** Optional secondary caption rendered under the progress bar (e.g. "12,345 / 24,000 chars"). */
  detail?: string | null;
};

/**
 * Full-screen loading overlay for blocking operations (PDF / PPT export,
 * long network calls). Uses the Modal primitive in `fullscreen` variant —
 * no card, just a centered spinner + caption on a blurred backdrop.
 *
 * When {@code progressPct} is supplied the overlay also renders a
 * determinate progress bar — used by the export flow while the
 * translator is streaming back the report payload. Otherwise we render
 * the indeterminate spinner only (PDF font load, PPT serialise, etc).
 *
 * Has no close affordance by design: the operation it represents controls
 * its lifetime. Escape key still closes (Modal default), giving the user
 * an out if something hangs — pass `onClose` indirectly by toggling `open`.
 */
export default function LoadingOverlay({ open, text, ariaLabel, progressPct, detail }: Props) {
  const hasProgress = typeof progressPct === 'number';
  const clampedPct = hasProgress ? Math.max(0, Math.min(100, progressPct as number)) : 0;
  return (
    <Modal open={open} onClose={() => undefined} ariaLabel={ariaLabel ?? text} variant="fullscreen">
      {!hasProgress && <div className="pdf-ov-spinner" aria-hidden />}
      <div className="pdf-ov-text">{text}</div>
      {hasProgress && (
        <>
          <div
            className="pdf-ov-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={clampedPct}
          >
            <div className="pdf-ov-progress-fill" style={{ width: `${clampedPct}%` }} />
          </div>
          {detail && <div className="pdf-ov-detail">{detail}</div>}
        </>
      )}
    </Modal>
  );
}
