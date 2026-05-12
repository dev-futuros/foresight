import { useCallback, useRef, useState } from 'react';
import { chat, type ChatContentBlock, type ChatMessage } from '../lib/aiClient';
import { dispatch, get as getCommand } from '../lib/commandBus';

export interface PendingConfirm {
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
  /** Pre-rendered label and optional rich preview, computed once when the
   *  chip is queued so the UI can render without re-resolving the command. */
  label: string;
  preview?: string;
  /** Set to true after the user has clicked the chip. The chip stays in
   *  the array (rather than being removed) so the UI can render it in
   *  an "applied" green state instead of collapsing into something
   *  smaller — matches the demo's persistent chip behaviour. */
  applied?: boolean;
}

interface ChatContextSnapshot {
  /** Pre-formatted USER STATE block, built by {@link buildAssistantSnapshot}.
   *  Stitched verbatim into the backend system prompt so the assistant
   *  answers grounded on what the user is currently looking at. */
  context?: string;
  language: 'es' | 'en';
}

/**
 * Manages the chat assistant: message history, the `tool_use`/`tool_result`
 * loop with the backend, and the queue of confirm-mode chips waiting on user
 * approval.
 *
 * <p><strong>Anthropic contract</strong>: when an assistant turn emits N
 * {@code tool_use} blocks, the very next user turn MUST contain exactly N
 * matching {@code tool_result} blocks — partial replies are rejected with
 * a 400 ("`tool_use` ids were found without `tool_result` blocks immediately
 * after"). We therefore <em>buffer</em> the results until every tool from
 * the assistant turn has been resolved (auto runs immediately, confirm waits
 * for a user click) and only then send a single combined user turn back.
 */
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirms, setPendingConfirms] = useState<PendingConfirm[]>([]);

  // Latest context+lang stays in a ref so the resume-after-confirm path
  // doesn't capture a stale closure. The send/resume entry points keep it
  // current.
  const ctxRef = useRef<ChatContextSnapshot>({ language: 'es', context: undefined });

  // Buffer for the in-flight assistant turn's tool_result blocks. Filled
  // incrementally by auto-tools (synchronous) and by resolveConfirm (when
  // the user clicks ✓/✕). Flushed as a single user-turn message to the
  // backend only when the buffer length matches expectedResultsRef — that's
  // what keeps Anthropic happy.
  const pendingResultsRef = useRef<ChatContentBlock[]>([]);
  /** Total tool_use count emitted by the last assistant turn. The flush
   *  threshold for {@link pendingResultsRef}. */
  const expectedResultsRef = useRef<number>(0);
  /** History snapshot taken right after the assistant turn was added. Used
   *  as the base for the user turn that flushes the buffered tool_results
   *  back to the backend. */
  const historyAtFlushRef = useRef<ChatMessage[]>([]);

  /** POST → process content blocks → either flush results immediately (all
   *  auto) or park until the user resolves the pending confirms. */
  const runLoop = useCallback(async (history: ChatMessage[]) => {
    setPending(true);
    setError(null);
    try {
      const resp = await chat({
        messages: history,
        context: ctxRef.current.context,
        language: ctxRef.current.language,
      });
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: resp.content,
      };
      const nextHistory: ChatMessage[] = [...history, assistantMsg];
      setMessages(nextHistory);

      const toolUseBlocks = resp.content.filter((b) => b.type === 'tool_use');
      if (toolUseBlocks.length === 0) {
        // Pure text answer — we're done.
        setPending(false);
        return;
      }

      // Set up the buffer for this assistant turn before we kick off any
      // auto tool. Confirms that resolve later will keep pushing into the
      // same buffer.
      pendingResultsRef.current = [];
      expectedResultsRef.current = toolUseBlocks.length;
      historyAtFlushRef.current = nextHistory;

      const newConfirms: PendingConfirm[] = [];
      for (const block of toolUseBlocks) {
        if (!block.id || !block.name) {
          // Malformed block — count it as resolved with an error so the
          // buffer threshold can still be reached.
          pendingResultsRef.current.push({
            type: 'tool_result',
            tool_use_id: block.id ?? 'unknown',
            content: 'Malformed tool_use block.',
            is_error: true,
          });
          continue;
        }
        const cmd = getCommand(block.name);
        const args = (block.input ?? {}) as Record<string, unknown>;
        if (!cmd) {
          pendingResultsRef.current.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Unknown tool: ${block.name}`,
            is_error: true,
          });
          continue;
        }
        if (cmd.mode === 'auto') {
          try {
            const r = await dispatch(block.name, args);
            pendingResultsRef.current.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: serialiseResult(r),
            });
          } catch (e) {
            pendingResultsRef.current.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: e instanceof Error ? e.message : 'Tool failed',
              is_error: true,
            });
          }
        } else {
          newConfirms.push({
            toolUseId: block.id,
            name: block.name,
            input: args,
            label: cmd.label?.(args as never) ?? block.name,
            preview: cmd.preview?.(args as never),
          });
        }
      }

      if (newConfirms.length > 0) {
        setPendingConfirms((prev) => [...prev, ...newConfirms]);
      }

      // Flush only when every tool_use has produced a tool_result. If
      // confirms are pending we pause and resolveConfirm will retry.
      if (pendingResultsRef.current.length >= expectedResultsRef.current) {
        await flushResults();
      } else {
        setPending(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat error');
      setPending(false);
    }
  }, []);

  /** Send the buffered tool_result blocks back to the backend as a single
   *  user turn, then continue the loop. Resets the buffer state so the next
   *  assistant turn starts clean. */
  const flushResults = useCallback(async () => {
    const results = pendingResultsRef.current;
    const baseHistory = historyAtFlushRef.current;
    pendingResultsRef.current = [];
    expectedResultsRef.current = 0;
    historyAtFlushRef.current = [];
    if (results.length === 0 || baseHistory.length === 0) {
      setPending(false);
      return;
    }
    const resultMsg: ChatMessage = { role: 'user', content: results };
    const next = [...baseHistory, resultMsg];
    setMessages(next);
    await runLoop(next);
  }, [runLoop]);

  const send = useCallback(
    async (text: string, snapshot: ChatContextSnapshot) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      ctxRef.current = snapshot;

      // The previous assistant turn may have left behind tool_use blocks
      // that don't yet have matching tool_result blocks — they're either
      // sitting in `pendingResultsRef.current` (auto-tool results + any
      // confirm chips the user clicked that didn't reach the flush
      // threshold) or still waiting on a user click (un-applied confirm
      // chips). Anthropic rejects the next request with 400 if ANY
      // tool_use from the previous assistant turn isn't paired with a
      // tool_result in the new user turn, so we walk the last assistant
      // message, gather every tool_use id, and synthesize results for
      // ids that aren't already covered by the buffer.
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      const expectedIds: string[] =
        lastAssistant && Array.isArray(lastAssistant.content)
          ? lastAssistant.content
              .filter(
                (b): b is ChatContentBlock & { id: string } =>
                  b.type === 'tool_use' && typeof b.id === 'string',
              )
              .map((b) => b.id)
          : [];
      const bufferedResults = [...pendingResultsRef.current];
      const bufferedIds = new Set(
        bufferedResults
          .map((b) => b.tool_use_id)
          .filter((id): id is string => typeof id === 'string'),
      );
      const declineBlocks: ChatContentBlock[] = expectedIds
        .filter((id) => !bufferedIds.has(id))
        .map((id) => ({
          type: 'tool_result',
          tool_use_id: id,
          content: 'User did not click this action; treating as declined.',
        }));
      if (bufferedResults.length > 0 || declineBlocks.length > 0) {
        const userMsg: ChatMessage = {
          role: 'user',
          content: [...bufferedResults, ...declineBlocks, { type: 'text', text: trimmed }],
        };
        // Drop only the un-applied chips; keep the applied ones so they
        // remain rendered in their green state in the conversation.
        setPendingConfirms((prev) => prev.filter((c) => c.applied));
        pendingResultsRef.current = [];
        expectedResultsRef.current = 0;
        historyAtFlushRef.current = [];
        setMessages((prev) => {
          const next = [...prev, userMsg];
          void runLoop(next);
          return next;
        });
        return;
      }

      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      setMessages((prev) => {
        const next = [...prev, userMsg];
        void runLoop(next);
        return next;
      });
    },
    [messages, runLoop],
  );

  /** Resolve a queued confirm chip. Pushes its tool_result into the same
   *  buffer the runLoop started; flushes when the threshold is reached.
   *
   *  <p>On accept, the chip is marked {@code applied: true} (rather than
   *  being removed) so the UI keeps rendering it in green-applied state.
   *  On decline, the chip is removed entirely — there's no compelling
   *  visual story for "user said no", and keeping it would clutter the
   *  bubble. (Decline is only triggered by the auto-decline path in
   *  send() these days; the chip UI no longer surfaces a decline button.)
   */
  const resolveConfirm = useCallback(
    async (toolUseId: string, accept: boolean) => {
      const target = pendingConfirms.find((c) => c.toolUseId === toolUseId);
      if (!target || target.applied) return;
      if (accept) {
        setPendingConfirms((prev) =>
          prev.map((c) => (c.toolUseId === toolUseId ? { ...c, applied: true } : c)),
        );
      } else {
        setPendingConfirms((prev) => prev.filter((c) => c.toolUseId !== toolUseId));
      }

      let result: ChatContentBlock;
      if (!accept) {
        result = {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: 'User declined to run this action.',
        };
      } else {
        try {
          const r = await dispatch(target.name, target.input);
          result = {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: serialiseResult(r),
          };
        } catch (e) {
          result = {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: e instanceof Error ? e.message : 'Tool failed',
            is_error: true,
          };
        }
      }
      pendingResultsRef.current.push(result);

      if (pendingResultsRef.current.length >= expectedResultsRef.current) {
        await flushResults();
      }
    },
    [pendingConfirms, flushResults],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setPendingConfirms([]);
    setPending(false);
    setError(null);
    pendingResultsRef.current = [];
    expectedResultsRef.current = 0;
    historyAtFlushRef.current = [];
  }, []);

  return {
    messages,
    pending,
    error,
    pendingConfirms,
    send,
    resolveConfirm,
    reset,
  };
}

function serialiseResult(r: unknown): string {
  if (r === undefined || r === null) return 'OK';
  if (typeof r === 'string') return r;
  try {
    return JSON.stringify(r);
  } catch {
    return String(r);
  }
}
