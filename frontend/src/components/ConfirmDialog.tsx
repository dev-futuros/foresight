import { useTranslation } from 'react-i18next';
import Modal from './Modal';

type Props = {
  open: boolean;
  title: string;
  description?: string;
  /** Optional override; defaults to translation key common.confirm. */
  confirmLabel?: string;
  /** Optional override; defaults to translation key common.cancel. */
  cancelLabel?: string;
  /** Renders the confirm button in red — for delete / destroy actions. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Styled replacement for native `confirm()` — backed by the Modal primitive.
 * Use for delete, discard, sign-out and similar yes/no prompts.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const confirmText = confirmLabel ?? t('common.confirm');
  const cancelText = cancelLabel ?? t('common.cancel');

  return (
    <Modal open={open} onClose={onCancel} ariaLabel={title}>
      <h2 className="modal-title">{title}</h2>
      {description && <p className="modal-desc">{description}</p>}
      <div className="modal-actions">
        <button type="button" className="modal-btn" onClick={onCancel}>
          {cancelText}
        </button>
        <button
          type="button"
          className={`modal-btn modal-btn--primary${destructive ? ' modal-btn--danger' : ''}`}
          onClick={onConfirm}
          autoFocus
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
