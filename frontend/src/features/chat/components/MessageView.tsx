import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessageView, PendingCommand } from '../hooks/useChat';
import type { PublishedWizardContext } from '../constants';
import { renderInlineMd } from '../utils/textRender';
import CommandChip from './CommandChip';

export interface MessageViewProps {
  view: ChatMessageView;
  messageIdx: number;
  /** Current wizard context — read by chips that compute state-aware
   *  labels (e.g. goTo to step 2 says "Generate Global STEEP" when the
   *  GS fields are empty, "Navigate to step 2" otherwise). */
  ctx: PublishedWizardContext | undefined;
  onApproveChip: (messageIdx: number, cmd: PendingCommand) => void | Promise<void>;
  onApplyAll: (messageIdx: number) => void | Promise<void>;
}

type ApplyAllState = 'idle' | 'running' | 'done';

/**
 * Renders one assistant or user turn. User content goes in a plain
 * bubble.
 *
 * <p>Assistant turns with parsed commands render the pre-chip prose
 * first, then the chips themselves (each clickable to approve), then
 * an Apply All button when 2+ chips are still pending, and finally —
 * only once nothing is pending — the post-chip prose.
 */
export default function MessageView({
  view,
  messageIdx,
  ctx,
  onApproveChip,
  onApplyAll,
}: MessageViewProps) {
  const { t } = useTranslation();
  const [applyAllState, setApplyAllState] = useState<ApplyAllState>('idle');
  const { message, commands, segments } = view;

  if (typeof message.content === 'string') {
    const isBot = message.role !== 'user';
    return (
      <div className={`chat-msg ${isBot ? 'bot' : 'user'}`}>
        {isBot ? (
          <div
            className="chat-bubble-text"
            dangerouslySetInnerHTML={{ __html: renderInlineMd(message.content) }}
          />
        ) : (
          <div className="chat-bubble-text">{message.content}</div>
        )}
      </div>
    );
  }

  // Block-array assistant turn. We split prose into pre/post around the
  // chip block; commands are the parsed-out tags awaiting the user.
  const pre = segments?.pre ?? '';
  const post = segments?.post ?? '';
  const hasCommands = !!commands && commands.length > 0;
  const pendingCount = commands?.filter((c) => c.status === 'pending').length ?? 0;
  const allResolved = hasCommands && pendingCount === 0;
  // While the assistant is still streaming, chips are visible but NOT
  // interactive — the user shouldn't approve the first one before the
  // tail arrives, and "Apply all" is hidden so it can't fire on a
  // partial set. Once the stream completes, both unlock.
  const isStreaming = view.streaming === true;
  const showApplyAll = !isStreaming && (applyAllState !== 'idle' || pendingCount >= 2);

  async function handleApplyAll() {
    if (applyAllState !== 'idle') return;
    setApplyAllState('running');
    await onApplyAll(messageIdx);
    setApplyAllState('done');
  }

  return (
    <div className={`chat-msg ${message.role === 'user' ? 'user' : 'bot'}`}>
      {pre && (
        <div
          className="chat-bubble-text"
          dangerouslySetInnerHTML={{ __html: renderInlineMd(pre) }}
        />
      )}
      {hasCommands && (
        <div className="chat-applied-list">
          {commands.map((cmd) => (
            <CommandChip
              key={cmd.id}
              cmd={cmd}
              ctx={ctx}
              streaming={isStreaming}
              onApprove={() => onApproveChip(messageIdx, cmd)}
            />
          ))}
        </div>
      )}
      {showApplyAll && (
        <button
          type="button"
          className={`chat-apply-all${applyAllState === 'done' || allResolved ? ' done' : ''}`}
          onClick={handleApplyAll}
          disabled={applyAllState !== 'idle' || pendingCount === 0}
        >
          {applyAllState === 'done' || allResolved ? t('chat.applyAllDone') : t('chat.applyAll')}
        </button>
      )}
      {allResolved && post && (
        <div
          className="chat-bubble-text chat-bubble-post"
          dangerouslySetInnerHTML={{ __html: renderInlineMd(post) }}
        />
      )}
    </div>
  );
}
