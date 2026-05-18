import type { LanguageCode } from '../../../i18n/languages';
/**
 * Chat-assistant endpoints. The unary `chat` returns the full reply at
 * once; `chatStream` opens an SSE connection and surfaces text deltas
 * as the model writes them, so the chat bubble can show the response
 * forming live.
 */
import api, { attachPostHogSession, getAuthToken } from '../../../lib/api';
import { parseSseFrameJson, splitSseFrame } from '../../../lib/sse';

export interface ChatContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  /** for type === 'text' */
  text?: string;
  /** for type === 'tool_use' */
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  /** for type === 'tool_result' */
  tool_use_id?: string;
  /** Result content. Plain string when the tool returned text; the
   *  model also accepts a list of {type:'text', text} blocks but we
   *  keep things simple. */
  content?: string;
  /** Marks tool_results that errored — Anthropic uses this to nudge
   *  the model to recover/retry instead of treating the result as
   *  success. */
  is_error?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  /** Strings allowed for plain user text turns; everything else
   *  (assistant output and user tool-result turns) uses the block
   *  array form. */
  content: string | ChatContentBlock[];
}

export interface ChatResponse {
  content: ChatContentBlock[];
  /** Anthropic emits "tool_use" when the response ended on a tool
   *  call, "end_turn" when the model is done. We use it to know when
   *  to keep looping vs. when to render the final answer. */
  stop_reason?: string;
}

/** Unary chat call — backend returns the full assembled response. */
export async function chat(args: {
  messages: ChatMessage[];
  /** Pre-formatted USER STATE block (see buildAssistantSnapshot). The
   *  backend stitches it verbatim into the system prompt. */
  context?: string;
  language: LanguageCode;
}): Promise<ChatResponse> {
  const { data } = await api.post<ChatResponse>('ai/chat', args);
  return data;
}

/**
 * Streaming variant of {@link chat}. Posts to /api/ai/chat/stream and
 * consumes the SSE flux of `{type:'delta', text}` events, firing
 * `onDelta` for each fragment so the chat bubble can show the
 * response forming live. Resolves with the full assembled text once
 * the `done` event arrives.
 *
 * Uses fetch() (not axios) because axios buffers the whole response
 * body before resolving, which would defeat streaming.
 */
export async function chatStream(
  args: {
    messages: ChatMessage[];
    context?: string;
    language: LanguageCode;
  },
  onDelta: (chunk: string) => void,
): Promise<{ text: string }> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  attachPostHogSession(headers);

  const res = await fetch('/api/ai/chat/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${detail.slice(0, 200)}`);
  }
  if (!res.body) throw new Error('Stream response had no body');
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('text/event-stream')) {
    throw new Error(`Expected text/event-stream, got "${ct}"`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let next = splitSseFrame(buffer);
    while (next !== null) {
      const { frame, rest } = next;
      buffer = rest;
      const evt = parseSseFrameJson<
        { type: 'delta'; text: string } | { type: 'done'; text: string }
      >(frame);
      if (evt === undefined) {
        next = splitSseFrame(buffer);
        continue;
      }
      if (evt.type === 'delta') {
        onDelta(evt.text);
      } else if (evt.type === 'done') {
        finalText = evt.text;
      }
      next = splitSseFrame(buffer);
    }
  }
  if (!finalText) {
    throw new Error('Chat stream closed before final response');
  }
  return { text: finalText };
}
