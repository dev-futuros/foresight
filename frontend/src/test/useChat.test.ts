import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

// Mock the wire transport (SSE stream) so we can synthesise assistant
// deltas without standing up a real backend. Each test that exercises
// `send` / `notify` configures chatStream's chunk callback to drive the
// hook's state transitions.
const chatStreamMock = vi.fn();
vi.mock('../features/chat/api', () => ({
  chatStream: (...args: unknown[]) => chatStreamMock(...args),
}));

// Mock the bus so resolved chips don't try to fire real handlers.
vi.mock('../lib/commandBus', () => ({
  dispatch: vi.fn(),
  get: vi.fn(),
}));

import { parseAssistantText, useChat } from '../features/chat/hooks/useChat';

beforeEach(() => {
  chatStreamMock.mockReset();
});

describe('parseAssistantText', () => {
  it('returns pure prose with no commands when the text has no tags', () => {
    const { pre, post, commands } = parseAssistantText('Hello there.');
    expect(pre).toBe('Hello there.');
    expect(post).toBe('');
    expect(commands).toEqual([]);
  });

  it('splits prose around a single command tag', () => {
    const text = 'before <command name="goTo">{"path":"/dashboard"}</command> after';
    const { pre, post, commands } = parseAssistantText(text);
    expect(pre).toBe('before');
    expect(post).toBe('after');
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      name: 'goTo',
      args: { path: '/dashboard' },
      status: 'pending',
    });
  });

  it('parses multiple commands in document order', () => {
    const text =
      'pre <command name="a">{"i":1}</command> middle <command name="b">{"i":2}</command> post';
    const { commands } = parseAssistantText(text);
    expect(commands.map((c) => c.name)).toEqual(['a', 'b']);
    expect(commands.map((c) => c.args.i)).toEqual([1, 2]);
  });

  it('marks a chip with status error + parseError when its JSON body is invalid', () => {
    const text = '<command name="goTo">{not valid json}</command>';
    const { commands } = parseAssistantText(text);
    expect(commands[0].status).toBe('error');
    expect(commands[0].parseError).toBeTruthy();
    expect(commands[0].error).toMatch(/Invalid JSON args/);
  });

  it("ignores non-object JSON bodies (treats them as empty args)", () => {
    // JSON arrays / primitives are technically valid JSON but the tool
    // schema only accepts objects — drop them onto an empty args bag.
    const text = '<command name="a">[1,2,3]</command>';
    const { commands } = parseAssistantText(text);
    expect(commands[0].status).toBe('pending');
    expect(commands[0].args).toEqual({});
  });

  it('hides an unclosed trailing <command... so streaming partials never flash', () => {
    // Mid-stream: opening tag arrived but closing one hasn't yet.
    const text = 'preface text <command name="goTo';
    const { pre, post, commands } = parseAssistantText(text);
    expect(pre).toBe('preface text');
    expect(post).toBe('');
    expect(commands).toEqual([]);
  });

  it('handles a complete tag even when an unclosed one comes after it', () => {
    const text =
      '<command name="a">{"i":1}</command> tail <command name="b';
    const { commands, pre, post } = parseAssistantText(text);
    // The completed tag is parsed; the dangling one is hidden.
    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('a');
    expect(pre).toBe('');
    expect(post).toBe('tail');
  });
});

describe('useChat — apiCursor & reset', () => {
  it('sends an empty history slice the first time send is called', async () => {
    // chatStream is invoked once per send; capture the messages argument
    // it receives so we can assert on what was sent vs. what was kept in UI.
    chatStreamMock.mockImplementation(
      (_args: { messages: unknown[] }, onChunk: (s: string) => void) => {
        onChunk('Hi back.');
        return Promise.resolve();
      },
    );
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.send('Hello', { language: 'en' });
    });

    expect(chatStreamMock).toHaveBeenCalledTimes(1);
    const sentMessages = chatStreamMock.mock.calls[0][0].messages;
    // Just the user turn we just typed.
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]).toMatchObject({ role: 'user', content: 'Hello' });
  });

  it('resetContext drops earlier turns from the outgoing API copy but keeps them visible', async () => {
    chatStreamMock.mockImplementation(
      (_args: { messages: unknown[] }, onChunk: (s: string) => void) => {
        onChunk('ack');
        return Promise.resolve();
      },
    );
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.send('first', { language: 'en' });
    });
    await act(async () => {
      await result.current.send('second', { language: 'en' });
    });

    // Sanity: the second send included both user turns + the first
    // assistant reply.
    const beforeReset = chatStreamMock.mock.calls[1][0].messages as { role: string }[];
    expect(beforeReset.length).toBeGreaterThanOrEqual(3);

    // Cursor jump: subsequent sends should ship just the new user turn,
    // not the prior history. Visible messages stay on screen.
    act(() => {
      result.current.resetContext();
    });
    const visibleBeforeNextSend = result.current.messages.length;

    await act(async () => {
      await result.current.send('third', { language: 'en' });
    });

    const afterReset = chatStreamMock.mock.calls[2][0].messages as { role: string; content: string }[];
    expect(afterReset).toHaveLength(1);
    expect(afterReset[0]).toMatchObject({ role: 'user', content: 'third' });
    // Visible history grew (didn't shrink) — the chat panel still shows
    // the earlier brief's Q&A.
    expect(result.current.messages.length).toBeGreaterThan(visibleBeforeNextSend);
  });

  it('reset() clears messages, pending, error, and the apiCursor', async () => {
    chatStreamMock.mockImplementation(
      (_args: unknown, onChunk: (s: string) => void) => {
        onChunk('ack');
        return Promise.resolve();
      },
    );
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.send('first', { language: 'en' });
    });
    expect(result.current.messages.length).toBeGreaterThan(0);

    act(() => {
      result.current.reset();
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();

    // Cursor should be back at 0: the next send must include the new
    // user turn as the entire outgoing API slice.
    await act(async () => {
      await result.current.send('post-reset', { language: 'en' });
    });
    const sent = chatStreamMock.mock.calls.at(-1)![0].messages as { content: string }[];
    expect(sent).toHaveLength(1);
    expect(sent[0].content).toBe('post-reset');
  });

  it('surfaces a stream error on result.error and drops the placeholder bubble', async () => {
    chatStreamMock.mockRejectedValueOnce(new Error('stream blew up'));
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.send('hi', { language: 'en' });
    });

    await waitFor(() => {
      expect(result.current.error).toBe('stream blew up');
    });
    // Only the user turn is visible — the empty assistant placeholder
    // was unwound by the catch branch.
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].message.role).toBe('user');
  });
});
