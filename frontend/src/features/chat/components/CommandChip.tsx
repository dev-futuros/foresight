import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PendingCommand } from '../hooks/useChat';
import { FIELD_NAME_KEY, PREVIEW_TOGGLE_THRESHOLD, type PublishedWizardContext } from '../constants';

/**
 * One chip per parsed `<command>` tag. Renders as a clickable confirm
 * card while pending; transitions to green "applied", red "error", or
 * muted "declined" once resolved. The whole card is the click target
 * — there's no separate confirm button.
 *
 * <p>Some chip labels are state-aware: goTo(step:2) reads "Generate
 * Global STEEP" when the GS fields are empty (because navigating there
 * auto-runs generation) and "Navigate to step 2" otherwise. Mirrors
 * the wizard's SplitButton primary-action logic so users see the same
 * label in both places.
 */
export interface CommandChipProps {
  cmd: PendingCommand;
  ctx: PublishedWizardContext | undefined;
  /** True while the parent message is still being streamed. A streaming
   *  chip is rendered as a placeholder — visible so the user can see
   *  proposals arriving, but not interactive. Once streaming finishes
   *  the chip becomes a normal clickable confirm. */
  streaming: boolean;
  onApprove: () => void | Promise<void>;
}

export default function CommandChip({ cmd, ctx, streaming, onApprove }: CommandChipProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const isSetField = cmd.name === 'setField';
  const args = cmd.args as { id?: string; mode?: string; value?: string };
  const fieldId = args.id ?? '';
  const fieldKey = isSetField ? FIELD_NAME_KEY[fieldId] : undefined;
  const fieldName = fieldKey ? t(fieldKey) : fieldId;
  const preview = isSetField ? (args.value ?? '') : '';
  const showToggle = preview.length >= PREVIEW_TOGGLE_THRESHOLD;

  const stateClass =
    cmd.status === 'applied'
      ? ' applied'
      : cmd.status === 'error'
        ? ' applied error'
        : cmd.status === 'declined'
          ? ' declined'
          : '';
  // Only pending chips on a finished message are clickable. While the
  // message is still streaming we keep the chip visible (so the user
  // sees proposals arrive in order) but block interaction so they can't
  // approve a single one before the full set has been delivered.
  const clickable = cmd.status === 'pending' && !streaming;
  const streamingClass = streaming && cmd.status === 'pending' ? ' streaming' : '';

  const headText = (() => {
    if (isSetField) {
      const verb =
        cmd.status === 'applied'
          ? t('chat.appliedTo')
          : cmd.status === 'error'
            ? t('chat.failedTo', { defaultValue: 'Failed' })
            : cmd.status === 'declined'
              ? t('chat.appliedTo')
              : args.mode === 'add'
                ? t('chat.addTo')
                : t('chat.replaceIn');
      return `${verb}: ${fieldName}`;
    }
    // State-aware override for goTo(step:2): when the Global STEEP
    // fields are empty, navigating there will auto-trigger generation,
    // so the chip surfaces that — matching the wizard's SplitButton
    // primary label. With data already present it's just navigation.
    if (cmd.name === 'goTo') {
      const goArgs = cmd.args as { step?: number };
      if (goArgs.step === 2) {
        const gs = ctx?.globalSteep;
        const hasGs =
          !!gs &&
          ((gs.S?.trim() ?? '') !== '' ||
            (gs.T?.trim() ?? '') !== '' ||
            (gs.E?.trim() ?? '') !== '' ||
            (gs.ENV?.trim() ?? '') !== '' ||
            (gs.P?.trim() ?? '') !== '');
        if (!hasGs) return t('chat.cmdLabels.generateGlobalSteep');
      }
      // Other steps: append step number for clarity ("Navigate to step 4").
      if (typeof goArgs.step === 'number') {
        return t('chat.cmdLabels.goToStep', {
          step: goArgs.step,
          defaultValue: `${t('chat.cmdLabels.goTo')} → ${goArgs.step}`,
        });
      }
    }
    const labelKey = `chat.cmdLabels.${cmd.name}`;
    return t(labelKey, { defaultValue: cmd.name });
  })();

  function handleClick() {
    if (!clickable) return;
    void onApprove();
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!clickable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void onApprove();
    }
  }

  return (
    <div
      className={`chat-confirm${stateClass}${streamingClass}${expanded ? ' expanded' : ''}`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : -1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={headText}
      aria-disabled={!clickable || undefined}
    >
      <div className="chat-confirm-head">
        <svg className="chat-confirm-head-ico" aria-hidden>
          <use href="#i-swap" />
        </svg>
        <span>{headText}</span>
      </div>
      {preview && (
        <div className={`chat-confirm-preview${expanded ? ' expanded' : ''}`}>{preview}</div>
      )}
      {showToggle && (
        <div className="chat-confirm-toggle-wrap">
          <button
            type="button"
            className="chat-confirm-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <span className="caret" aria-hidden>
              ▾
            </span>
            {expanded ? t('chat.showLess') : t('chat.showMore')}
          </button>
        </div>
      )}
      {cmd.status === 'error' && cmd.error && <div className="chat-confirm-error">{cmd.error}</div>}
    </div>
  );
}
