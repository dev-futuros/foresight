import Modal from './Modal';

interface Props {
  open: boolean;
  /** Caption shown beneath the spinner (mono uppercase, gold). */
  text: string;
  /** Optional ARIA label; defaults to the caption text. */
  ariaLabel?: string;
}

/**
 * Full-screen loading overlay for blocking operations (PDF / PPT export,
 * long network calls). Uses the Modal primitive in `fullscreen` variant —
 * no card, just a centered spinner + caption on a blurred backdrop.
 *
 * Has no close affordance by design: the operation it represents controls
 * its lifetime. Escape key still closes (Modal default), giving the user
 * an out if something hangs — pass `onClose` indirectly by toggling `open`.
 */
export default function LoadingOverlay({ open, text, ariaLabel }: Props) {
  return (
    <Modal open={open} onClose={() => undefined} ariaLabel={ariaLabel ?? text} variant="fullscreen">
      <div className="pdf-ov-spinner" aria-hidden />
      <div className="pdf-ov-text">{text}</div>
    </Modal>
  );
}
