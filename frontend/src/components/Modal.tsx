import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** Optional ARIA label when there's no visible <h2> title. */
  ariaLabel?: string;
  /** Visual variant. `dialog` is a centered card; `fullscreen` is a fullscreen overlay (e.g. for export spinners). */
  variant?: 'dialog' | 'fullscreen';
  /** Extra class(es) for the dialog body — lets consumers customise width / padding / accent border without forking the primitive. */
  dialogClassName?: string;
  children: ReactNode;
};

/**
 * Generic modal primitive — overlay backdrop + dialog body, ported from
 * the prototype's `.share-modal`. Uses a portal so it escapes any
 * `position: relative` ancestors and any `overflow: hidden` clipping.
 *
 * Closes on ESC, on backdrop click, and via the consumer's onClose callback.
 * Locks body scroll while open.
 */
export default function Modal({
  open,
  onClose,
  ariaLabel,
  variant = 'dialog',
  dialogClassName,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // ESC to close + body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Move focus into the dialog when it opens, return it on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={`modal-overlay${variant === 'fullscreen' ? ' modal-overlay--fullscreen' : ''}`}
      onMouseDown={(e) => {
        // Close only when the user clicks the backdrop itself, not when a
        // mousedown started inside the dialog and dragged onto the backdrop.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`modal-dialog${variant === 'fullscreen' ? ' modal-dialog--fullscreen' : ''}${dialogClassName ? ` ${dialogClassName}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
