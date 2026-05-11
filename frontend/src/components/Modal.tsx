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
 * Refcount of currently-open Modals. Each open instance increments on mount
 * and decrements on cleanup. The body's overflow is locked while the count
 * is positive and restored when it drops to 0.
 *
 * <p>The naive "capture prev / restore prev" pattern fails when modals
 * stack: a second modal opening while the first is already open captures
 * {@code prevOverflow="hidden"}, and on close restores {@code "hidden"} —
 * leaving the body scroll locked even after both modals are gone. This
 * showed up when the example-loader flow had the OnboardingDialog and the
 * LoadingOverlay both open simultaneously; the user got stranded with an
 * unscrollable page after navigation. The refcount makes the lock idempotent
 * regardless of cleanup ordering between sibling modals.
 */
let openModalCount = 0;
let originalBodyOverflow: string | null = null;

function acquireBodyLock() {
  if (openModalCount === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openModalCount += 1;
}

function releaseBodyLock() {
  openModalCount = Math.max(0, openModalCount - 1);
  if (openModalCount === 0) {
    document.body.style.overflow = originalBodyOverflow ?? '';
    originalBodyOverflow = null;
  }
}

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

  // ESC to close + body scroll lock while open. Body lock is refcounted at
  // module scope (see acquireBodyLock/releaseBodyLock) so stacked modals
  // don't leave the body in overflow:hidden after both close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    acquireBodyLock();
    return () => {
      document.removeEventListener('keydown', onKey);
      releaseBodyLock();
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
