import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dispatch,
  register,
  unregister,
  get as getSpec,
  list as listSpecs,
} from '../lib/commandBus';

// Mixpanel is fired via the imported `track` function — mock it so we can
// assert on the analytics payload without standing up the SDK.
const trackMock = vi.fn();
vi.mock('../lib/mixpanel', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

beforeEach(() => {
  trackMock.mockReset();
  // The bus's registry is module-level. Each test registers its own
  // command under a unique name, but clean up any registrations the
  // previous test left behind to keep tests order-independent.
  for (const spec of listSpecs()) {
    unregister(spec.name);
  }
});

describe('dispatch — happy path', () => {
  it('calls the handler and returns its result', async () => {
    const handler = vi.fn().mockResolvedValue('ok');
    register({ name: 'doThing', mode: 'auto', handler });

    const out = await dispatch('doThing', { foo: 1 });

    expect(handler).toHaveBeenCalledWith({ foo: 1 });
    expect(out).toBe('ok');
  });

  it('tracks success with command, source, success:true, and durationMs', async () => {
    register({ name: 'doThing', mode: 'auto', handler: () => 'ok' });

    await dispatch('doThing', {}, 'assistant');

    expect(trackMock).toHaveBeenCalledTimes(1);
    const [event, props] = trackMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toBe('Command Dispatched');
    expect(props).toMatchObject({
      command: 'doThing',
      source: 'assistant',
      success: true,
    });
    expect(typeof props.durationMs).toBe('number');
  });

  it("defaults source to 'ui' when not provided", async () => {
    register({ name: 'doThing', mode: 'auto', handler: () => 'ok' });

    await dispatch('doThing', {});

    const [, props] = trackMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(props.source).toBe('ui');
  });
});

describe('dispatch — unknown command', () => {
  it('throws with the missing name', async () => {
    await expect(dispatch('nope', {})).rejects.toThrow('Unknown command: nope');
  });

  it("tracks success:false with error 'unknown_command'", async () => {
    await expect(dispatch('nope', {}, 'assistant')).rejects.toThrow();

    expect(trackMock).toHaveBeenCalledWith('Command Dispatched', {
      command: 'nope',
      source: 'assistant',
      success: false,
      error: 'unknown_command',
    });
  });
});

describe('dispatch — handler throws', () => {
  it('rethrows the error to the caller', async () => {
    register({
      name: 'doThing',
      mode: 'auto',
      handler: () => {
        throw new Error('boom');
      },
    });

    await expect(dispatch('doThing', {})).rejects.toThrow('boom');
  });

  it('tracks success:false with the truncated error message', async () => {
    const bigMessage = 'x'.repeat(500);
    register({
      name: 'doThing',
      mode: 'auto',
      handler: () => {
        throw new Error(bigMessage);
      },
    });

    await expect(dispatch('doThing', {})).rejects.toThrow();

    const [, props] = trackMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(props).toMatchObject({ command: 'doThing', success: false });
    // Error messages are clipped at 200 chars to keep Mixpanel payloads bounded.
    expect((props.error as string).length).toBe(200);
  });

  it("falls back to 'unknown' when the throw isn't an Error", async () => {
    register({
      name: 'doThing',
      mode: 'auto',
      handler: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'a string';
      },
    });

    await expect(dispatch('doThing', {})).rejects.toBeDefined();

    const [, props] = trackMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(props.error).toBe('unknown');
  });
});

describe('dispatch — silent commands', () => {
  it('skips tracking on success when silent: true', async () => {
    register({ name: 'doThing', mode: 'auto', silent: true, handler: () => 'ok' });

    await dispatch('doThing', {});

    expect(trackMock).not.toHaveBeenCalled();
  });

  it('skips tracking on handler error when silent: true', async () => {
    register({
      name: 'doThing',
      mode: 'auto',
      silent: true,
      handler: () => {
        throw new Error('boom');
      },
    });

    await expect(dispatch('doThing', {})).rejects.toThrow();

    expect(trackMock).not.toHaveBeenCalled();
  });
});

describe('dispatch — trackArgs filtering', () => {
  it('ships only whitelisted keys', async () => {
    register({
      name: 'doThing',
      mode: 'auto',
      trackArgs: ['format'],
      handler: () => 'ok',
    });

    await dispatch('doThing', { format: 'pdf', secret: 'leaky' });

    const [, props] = trackMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(props.format).toBe('pdf');
    expect(props).not.toHaveProperty('secret');
  });

  it('drops non-primitive whitelisted values (objects, arrays, functions)', async () => {
    register({
      name: 'doThing',
      mode: 'auto',
      trackArgs: ['payload', 'list', 'fn', 'count'],
      handler: () => 'ok',
    });

    await dispatch('doThing', {
      payload: { nested: true },
      list: [1, 2, 3],
      fn: () => 'no',
      count: 7,
    });

    const [, props] = trackMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(props).not.toHaveProperty('payload');
    expect(props).not.toHaveProperty('list');
    expect(props).not.toHaveProperty('fn');
    expect(props.count).toBe(7);
  });

  it('keeps null as a primitive (string|number|boolean|null all allowed)', async () => {
    register({
      name: 'doThing',
      mode: 'auto',
      trackArgs: ['mode', 'flag', 'nope'],
      handler: () => 'ok',
    });

    await dispatch('doThing', { mode: 'auto', flag: true, nope: null });

    const [, props] = trackMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(props.mode).toBe('auto');
    expect(props.flag).toBe(true);
    expect(props.nope).toBeNull();
  });

  it('is a no-op when trackArgs is empty / omitted', async () => {
    register({ name: 'doThing', mode: 'auto', handler: () => 'ok' });

    await dispatch('doThing', { anything: 'goes' });

    const [, props] = trackMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(props).not.toHaveProperty('anything');
  });
});

describe('dispatch — enrichTrack', () => {
  it('adds returned primitives to the event payload', async () => {
    register({
      name: 'doThing',
      mode: 'auto',
      handler: () => ({ id: 'r-1' }),
      enrichTrack: (_args, result) => ({ reportId: (result as { id: string }).id, count: 3 }),
    });

    await dispatch('doThing', {});

    const [, props] = trackMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(props.reportId).toBe('r-1');
    expect(props.count).toBe(3);
  });

  it('drops nested objects / arrays / functions from the enrichment', async () => {
    register({
      name: 'doThing',
      mode: 'auto',
      handler: () => 'ok',
      enrichTrack: () => ({
        safe: 'yes',
        sliceOfState: { secret: 'no' },
        items: [1, 2],
        fn: () => 'no',
      }),
    });

    await dispatch('doThing', {});

    const [, props] = trackMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(props.safe).toBe('yes');
    expect(props).not.toHaveProperty('sliceOfState');
    expect(props).not.toHaveProperty('items');
    expect(props).not.toHaveProperty('fn');
  });

  it("doesn't fail the dispatch when enrichTrack throws", async () => {
    register({
      name: 'doThing',
      mode: 'auto',
      handler: () => 'ok',
      enrichTrack: () => {
        throw new Error('broken enricher');
      },
    });

    // Handler already succeeded, so the dispatch resolves cleanly.
    await expect(dispatch('doThing', {})).resolves.toBe('ok');

    // Event still fires — just without the would-be enrichment props.
    expect(trackMock).toHaveBeenCalledTimes(1);
    const [, props] = trackMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(props.success).toBe(true);
  });
});

describe('registry', () => {
  it('register / get / unregister round-trip', () => {
    const spec = { name: 'a', mode: 'auto' as const, handler: () => 'ok' };
    register(spec);
    expect(getSpec('a')).toBe(spec);
    unregister('a');
    expect(getSpec('a')).toBeUndefined();
  });

  it('re-registering a name overrides the previous handler (HMR support)', async () => {
    register({ name: 'a', mode: 'auto', handler: () => 'first' });
    register({ name: 'a', mode: 'auto', handler: () => 'second' });

    await expect(dispatch('a', {})).resolves.toBe('second');
  });
});
