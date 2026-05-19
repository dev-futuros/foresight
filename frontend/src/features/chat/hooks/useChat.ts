import type { LanguageCode } from '../../../i18n/languages';
import { useCallback, useEffect, useRef, useState } from 'react';
import { chatStream, type ChatMessage } from '../api';
import { dispatch, get as getCommandSpec } from '../../../lib/commandBus';

/**
 * A command the assistant emitted as a `<command name="...">{json}</command>`
 * tag inline in its text reply. Parsed at receive-time but NOT auto-dispatched;
 * the user resolves each one via the chip UI (or batches them via Apply All).
 *
 * <p>Status transitions:
 * <ul>
 *   <li>{@code pending} → {@code applied} on successful dispatch
 *   <li>{@code pending} → {@code error} when dispatch throws
 *   <li>{@code pending} → {@code declined} when the user implicitly cancels by
 *       sending a new message before resolving the chip
 * </ul>
 */
export interface PendingCommand {
  /** Stable id used by the renderer for click handlers and React keys. */
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'applied' | 'declined' | 'error';
  /** Populated when {@code status === 'error'}; the dispatch's thrown message. */
  error?: string;
  /** Parse error string when the `<command>` body wasn't valid JSON. The chip
   *  is rendered as a non-actionable error pill in this case. */
  parseError?: string;
}

/**
 * Wraps a wire {@link ChatMessage} with the UI-side state our renderer needs:
 * the parsed commands and the prose split into pre/post halves around the
 * chip block. Lives alongside the wire message rather than inside it so
 * {@code content} stays as Anthropic expects.
 */
export interface ChatMessageView {
  message: ChatMessage;
  /** Populated only for assistant turns whose text contained `<command>`
   *  tags. Commands are surfaced in document order. */
  commands?: PendingCommand[];
  /** Assistant prose split at the chip block: text before any command +
   *  text after the last command. Whatever falls between commands is
   *  discarded (in practice models don't write prose mid-batch). */
  segments?: { pre: string; post: string };
  /** When true, this message is part of the API conversation but the UI
   *  must not render a bubble for it. Used for the synthetic prompts the
   *  wizard pushes via {@link useChat.notify} when an async action
   *  completes (e.g. Global STEEP generation finished) — the assistant's
   *  REPLY is what surfaces; the trigger itself is invisible. */
  hidden?: boolean;
  /** True while the assistant is still streaming this message. Renderers
   *  use it to (a) hold "Apply all" off-screen until every chip has
   *  arrived, and (b) keep individual chips non-interactive — the user
   *  might otherwise approve a chip while a tail one is still being
   *  parsed and end up missing it. Flipped to false in the final
   *  post-stream setMessages call. */
  streaming?: boolean;
}

interface ChatContextSnapshot {
  context?: string;
  language: LanguageCode;
}

const COMMAND_TAG_RE = /<command\s+name\s*=\s*"([^"]+)"\s*>([\s\S]*?)<\/command>/g;

let cmdSeq = 0;

interface ParsedAssistantText {
  pre: string;
  post: string;
  commands: PendingCommand[];
}

/**
 * Hide any unclosed `<command…` at the END of the text so streaming
 * deltas don't flash a partial tag into view before the closing
 * `</command>` arrives. Same defensive trick the demo uses in
 * `renderChatMarkdown`. Safe on complete text: a fully-closed tag has
 * its closing index after its opening, so the function is a no-op
 * once the stream finishes.
 */
function stripUnclosedTailTag(text: string): string {
  const openIdx = text.lastIndexOf('<command');
  const closeIdx = text.lastIndexOf('</command>');
  if (openIdx !== -1 && openIdx > closeIdx) {
    return text.slice(0, openIdx);
  }
  return text;
}

/**
 * Pull every `<command name="…">{…}</command>` out of an assistant text and
 * return them in document order alongside the prose split into pre/post
 * halves around the chip block. Commands come back as {@code status:
 * 'pending'} — nothing dispatches here.
 */
function parseAssistantText(text: string): ParsedAssistantText {
  // Strip any unclosed tail tag before scanning — keeps partial tags
  // from leaking into the visible pre/post prose during streaming.
  const cleaned = stripUnclosedTailTag(text);
  const matches: RegExpExecArray[] = [];
  COMMAND_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COMMAND_TAG_RE.exec(cleaned)) !== null) {
    matches.push(m);
  }
  if (matches.length === 0) {
    return { pre: cleaned.trim(), post: '', commands: [] };
  }
  const first = matches[0];
  const last = matches[matches.length - 1];
  const pre = cleaned.slice(0, first.index).trim();
  const post = cleaned.slice(last.index + last[0].length).trim();
  const commands: PendingCommand[] = matches.map((mm) => {
    const name = mm[1].trim();
    const body = (mm[2] ?? '').trim();
    let args: Record<string, unknown> = {};
    let parseError: string | undefined;
    if (body) {
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch (e) {
        parseError = e instanceof Error ? e.message : 'Invalid JSON';
      }
    }
    return {
      id: `cmd-${++cmdSeq}`,
      name,
      args,
      status: parseError ? 'error' : 'pending',
      error: parseError ? `Invalid JSON args: ${parseError}` : undefined,
      parseError,
    };
  });
  return { pre, post, commands };
}

/**
 * Manages the chat assistant: message history, request lifecycle, and the
 * pending-chip queue. The assistant emits commands as inline
 * `<command>{json}</command>` tags (one reply can carry N of them); each
 * surfaces as a confirm chip that the user resolves individually or via
 * Apply All. The prose after the chip block stays hidden until everything
 * in that batch is resolved — keeps the "All set" framing honest until
 * the actions have actually happened.
 */
export function useChat() {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<ChatContextSnapshot>({ language: 'es', context: undefined });
  // Mirror of messages / pending so async callbacks can read fresh snapshots
  // without re-subscribing on every render. Updated each render via effect.
  const messagesRef = useRef<ChatMessageView[]>([]);
  const pendingRef = useRef(false);
  useEffect(() => {
    messagesRef.current = messages;
    pendingRef.current = pending;
  });
  // Index into `messages` marking the start of the current API-facing
  // conversation. Messages at index < apiCursor are visible in the
  // chat UI but excluded from outgoing API requests. Bumped to the
  // current message count by {@link resetContext} when the wizard
  // starts a new report or loads a different one — the previous
  // brief's Q&A stays on screen for context but the model gets a
  // clean slate so it doesn't keep reasoning about the old report.
  const apiCursorRef = useRef(0);
  // Failure / decline notes accumulate here between turns and fold into
  // the FRONT of the API copy of the user's next message. Done this way
  // (rather than as a standalone synthetic user message) because Anthropic
  // rejects two consecutive same-role messages — folding keeps strict
  // alternation while surfacing the failure to the model on its next turn.
  // The user's displayed bubble stays clean: the notes are appended only
  // to the API copy, not to the visible message state.
  const pendingFailureNotesRef = useRef<string[]>([]);

  const runLoop = useCallback(async (history: ChatMessageView[]) => {
    setPending(true);
    setError(null);
    try {
      const notes = pendingFailureNotesRef.current;
      pendingFailureNotesRef.current = [];
      // Only send messages from the current context boundary onward.
      // Pre-boundary messages remain visible in the UI (they're part of
      // `messages`) but the API gets a clean slate after a newReport /
      // loadReport — see {@link resetContext}.
      const apiMessages = history.slice(apiCursorRef.current).map((m) => m.message);
      if (notes.length > 0 && apiMessages.length > 0) {
        const last = apiMessages[apiMessages.length - 1];
        if (last.role === 'user' && typeof last.content === 'string') {
          apiMessages[apiMessages.length - 1] = {
            role: 'user',
            content: `${notes.join('\n')}\n\n${last.content}`,
          };
        }
      }

      // Streaming chat — append a placeholder assistant message
      // immediately, then update its text content as each SSE delta
      // arrives. The user sees the response forming live instead of
      // waiting for the whole reply to arrive. <command> tags can't
      // be parsed mid-stream (the tag might be split across deltas),
      // so we parse them once at the end. Pre/post text segments are
      // shown unparsed during streaming — fine because they'll just
      // contain prose, not chip placeholders.
      let accText = '';
      const placeholderMessage: ChatMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: '' }],
      };
      const placeholderView: ChatMessageView = {
        message: placeholderMessage,
        segments: { pre: '', post: '' },
        streaming: true,
      };
      const baseHistory = [...history, placeholderView];
      setMessages(baseHistory);
      await chatStream(
        {
          messages: apiMessages,
          context: ctxRef.current.context,
          language: ctxRef.current.language,
        },
        (chunk) => {
          accText += chunk;
          // Re-parse on every delta so the user sees commands appear
          // as soon as the assistant emits the closing </command>. Cheap —
          // the parser is regex-based and 1500 tokens is small.
          const { pre, post, commands: parsedCommands } = parseAssistantText(accText);
          setMessages((prev) => {
            const next = prev.slice();
            const last = next[next.length - 1];
            if (!last) return prev;
            next[next.length - 1] = {
              ...last,
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: accText }],
              },
              segments: { pre, post },
              commands: parsedCommands.length > 0 ? parsedCommands : undefined,
              streaming: true,
            };
            return next;
          });
        },
      );

      // Final parse on the assembled text. Auto-mode commands dispatch
      // here — confirm-mode chips stay pending for the user to click.
      const { pre, post, commands } = parseAssistantText(accText);
      for (const cmd of commands) {
        if (cmd.status !== 'pending') continue;
        const spec = getCommandSpec(cmd.name);
        if (spec?.mode !== 'auto') continue;
        try {
          await dispatch(cmd.name, cmd.args, 'assistant');
          cmd.status = 'applied';
        } catch (e) {
          cmd.status = 'error';
          cmd.error = e instanceof Error ? e.message : 'Command failed';
          pendingFailureNotesRef.current.push(`[command failed: ${cmd.name} — ${cmd.error}]`);
        }
      }
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: accText }],
      };
      setMessages((prev) => {
        const next = prev.slice();
        next[next.length - 1] = {
          message: assistantMsg,
          segments: { pre, post },
          commands: commands.length > 0 ? commands : undefined,
          // Stream is done — chips become interactive, Apply All
          // appears (if the message is multi-chip and any are still
          // pending).
          streaming: false,
        };
        return next;
      });
    } catch (e) {
      // Drop the in-progress placeholder so the error doesn't sit
      // under an empty assistant bubble.
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.message.role === 'assistant') return prev.slice(0, -1);
        return prev;
      });
      setError(e instanceof Error ? e.message : 'Chat error');
    } finally {
      setPending(false);
    }
  }, []);

  const send = useCallback(
    async (text: string, snapshot: ChatContextSnapshot) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      ctxRef.current = snapshot;

      // Auto-decline any commands left pending in the most recent assistant
      // turn — when the user moves on without applying, the model gets a
      // note that those actions were skipped so it doesn't keep believing
      // its own emitted tags landed.
      const decliningNotes: string[] = [];
      const carriedMessages = messages.map((mv, i) => {
        if (i !== messages.length - 1) return mv;
        if (!mv.commands || mv.commands.length === 0) return mv;
        const updatedCommands = mv.commands.map((c) => {
          if (c.status === 'pending') {
            decliningNotes.push(
              `[command not executed: ${c.name} — user moved on without applying]`,
            );
            return { ...c, status: 'declined' as const };
          }
          return c;
        });
        return { ...mv, commands: updatedCommands };
      });
      if (decliningNotes.length > 0) {
        pendingFailureNotesRef.current.push(...decliningNotes);
      }

      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      const next: ChatMessageView[] = [...carriedMessages, { message: userMsg }];
      setMessages(next);
      void runLoop(next);
    },
    [messages, runLoop],
  );

  /**
   * Resolve one chip in the given message. On accept, dispatches the
   * command and marks the chip {@code applied} (or {@code error} if
   * dispatch threw). On decline, marks {@code declined} and queues a
   * note for the model so it knows not to assume the action landed.
   */
  const resolveCommand = useCallback(
    async (messageIdx: number, commandId: string, accept: boolean) => {
      // Read snapshot once. State mutates inside the dispatch so we use
      // the functional setMessages form to update at the end.
      const snap = messagesRef.current;
      const mv = snap[messageIdx];
      const cmd = mv?.commands?.find((c) => c.id === commandId);
      if (cmd?.status !== 'pending') return;

      let nextStatus: PendingCommand['status'];
      let nextError: string | undefined;
      if (!accept) {
        nextStatus = 'declined';
        pendingFailureNotesRef.current.push(`[command declined by user: ${cmd.name}]`);
      } else {
        try {
          await dispatch(cmd.name, cmd.args, 'assistant');
          nextStatus = 'applied';
        } catch (e) {
          nextStatus = 'error';
          nextError = e instanceof Error ? e.message : 'Command failed';
          pendingFailureNotesRef.current.push(`[command failed: ${cmd.name} — ${nextError}]`);
        }
      }
      setMessages((prev) =>
        prev.map((m, i) => {
          if (i !== messageIdx) return m;
          if (!m.commands) return m;
          return {
            ...m,
            commands: m.commands.map((c) =>
              c.id === commandId ? { ...c, status: nextStatus, error: nextError ?? c.error } : c,
            ),
          };
        }),
      );
    },
    [],
  );

  /**
   * Wizard-triggered hidden notification. Pushes a synthetic user message
   * (not rendered in the chat) and runs an assistant turn so the model
   * can react to the event — e.g. offer refinement help right after
   * Global STEEP generation finishes. Skipped silently when:
   * <ul>
   *   <li>The chat has never been used in this session (no messages yet)
   *       — avoids spamming users who haven't opened the panel
   *   <li>A turn is already in flight ({@code pending}) — would interleave
   *       roles and trip Anthropic's alternation check
   *   <li>The most recent message is itself a hidden notification — a
   *       burst of generation events shouldn't chain N back-to-back turns
   * </ul>
   */
  const notify = useCallback(
    async (note: string, snapshot: ChatContextSnapshot) => {
      const trimmed = note.trim();
      if (!trimmed) return;
      const snap = messagesRef.current;
      if (snap.length === 0) return;
      if (pendingRef.current) return;
      const last = snap[snap.length - 1];
      if (last.hidden) return;
      ctxRef.current = snapshot;
      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      const next: ChatMessageView[] = [...snap, { message: userMsg, hidden: true }];
      setMessages(next);
      void runLoop(next);
    },
    [runLoop],
  );

  /**
   * Fire every pending command in the given message in document order.
   * Sequential because many commands mutate the same form state; parallel
   * dispatch would race their setStates.
   */
  const applyAllInMessage = useCallback(
    async (messageIdx: number) => {
      const mv = messagesRef.current[messageIdx];
      if (!mv?.commands) return;
      const ids = mv.commands.filter((c) => c.status === 'pending').map((c) => c.id);
      for (const id of ids) {
        await resolveCommand(messageIdx, id, true);
      }
    },
    [resolveCommand],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setPending(false);
    setError(null);
    pendingFailureNotesRef.current = [];
    apiCursorRef.current = 0;
  }, []);

  /**
   * Reset only the API-facing conversation context — visible message
   * history stays on screen. Called from the wizard when the user
   * starts a new report or loads a different one: the previous
   * brief's Q&A is no longer relevant to the new content, but wiping
   * the chat entirely would be jarring. This pushes the apiCursor
   * forward to the current end-of-messages, so subsequent runLoop
   * calls only include post-reset turns. Pending failure / decline
   * notes for the old context are dropped too — they referenced
   * commands the model no longer "remembers".
   */
  const resetContext = useCallback(() => {
    apiCursorRef.current = messagesRef.current.length;
    pendingFailureNotesRef.current = [];
  }, []);

  return {
    messages,
    pending,
    error,
    send,
    notify,
    resolveCommand,
    applyAllInMessage,
    reset,
    resetContext,
  };
}

/** Exposed for the renderer so it can strip tags out of assistant text
 *  blocks before display. Kept here so the parser logic lives in one
 *  place. Also drops any unclosed tail `<command…` so streaming
 *  partials don't flash a half-typed tag into the bubble. */
export function stripCommandTags(text: string): string {
  return stripUnclosedTailTag(text).replace(COMMAND_TAG_RE, '').trim();
}
