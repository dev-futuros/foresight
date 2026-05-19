/**
 * Tiny client-side command bus used by the chat assistant.
 *
 * Each registered command has:
 *  - a unique `name` (matches the tool name declared on the backend)
 *  - a `mode`: `auto` runs immediately when the assistant emits the tool;
 *    `confirm` queues a chip that the user must approve before running
 *  - a `handler` that does the actual work (navigate, fill a field, etc.)
 *  - an optional `label`/`preview` to render in confirmation chips
 *
 * The chat hook calls {@link dispatch} for every `<command>` tag the
 * assistant emits inline in its text reply. Auto-mode commands fire
 * immediately on receipt; confirm-mode is reserved for command sources
 * outside the chat (kept for future use — the chat itself no longer
 * surfaces confirm chips since the demo-aligned prompt asks the model
 * to verbally confirm destructive/expensive actions before emitting them).
 *
 * Commands are typically registered once, near app startup, by a feature
 * that owns the side-effect (router for navigation, form state for setField,
 * etc.). Registration is idempotent — re-registering a name overrides the
 * previous handler so hot-module replacement during dev keeps working.
 *
 * <p><b>Analytics:</b> every successful {@link dispatch} fires a single
 * {@code Command Dispatched} Mixpanel event automatically — this is the
 * canonical source of truth for "what user actions just happened",
 * since commands ARE the action vocabulary of the app (both UI clicks
 * and assistant chip clicks route through here). Individual commands
 * opt into shipping specific arg keys via {@link CommandSpec.trackArgs};
 * the default is to ship none, so free-text args (setField's `value`)
 * can never leak by accident.
 */

import { track } from './mixpanel';

export type CommandMode = 'auto' | 'confirm';

/**
 * Who triggered this dispatch — used as a property on the auto-fired
 * {@code Command Dispatched} event so the Mixpanel dashboard can split
 * "user clicked a button" from "AI assistant emitted a tool call".
 *
 * <p>UI direct clicks (TopBar buttons, page-scoped command handlers,
 * keyboard shortcuts) → {@code 'ui'}. Anything the assistant proposes
 * (auto-mode streaming OR a confirm-mode chip the user later clicked)
 * → {@code 'assistant'}, because the AI was what put the action in
 * front of the user.
 */
export type CommandSource = 'ui' | 'assistant';

export interface CommandSpec<TArgs = Record<string, unknown>, TResult = unknown> {
  name: string;
  mode: CommandMode;
  /** Short label for the chip / activity entry. Falls back to name when omitted. */
  label?: (args: TArgs) => string;
  /** Optional richer preview shown inside confirm chips (e.g. for setField). */
  preview?: (args: TArgs) => string;
  handler: (args: TArgs) => Promise<TResult> | TResult;
  /**
   * Skip Mixpanel tracking entirely for this command. Use for ultra-
   * noisy or purely-internal commands. Almost everything user-facing
   * should leave this off (default) so the dashboard sees the action.
   */
  silent?: boolean;
  /**
   * Whitelist of arg property names that are safe to ship as Mixpanel
   * event properties. Defaults to no args (the dispatch is tracked
   * with just {command, source, success, durationMs}).
   *
   * <p>Per-command opt-in instead of a global denylist because args
   * vary widely: {@code setField} carries {@code value} (confidential
   * client text); {@code exportReport} carries {@code format} (safe
   * enum). Default-deny means adding a new command can't accidentally
   * leak — you have to think about each key explicitly.
   *
   * <p>NEVER list keys that carry free-text user input or report
   * content. Bounded enums, IDs, numbers, and booleans only.
   */
  trackArgs?: readonly string[];
  /**
   * Closure-derived properties to attach to the {@code Command
   * Dispatched} event. Use this when the useful event properties
   * aren't in the dispatch args but ARE in scope where the command
   * was registered — e.g. {@code runAnalysis}'s handler reads the
   * wizard's mode/horizon/hasGlobalSteep from React state.
   *
   * <p>The bus calls this AFTER the handler resolves (so the
   * callback can also reflect any state the handler mutated), and
   * the same safe-primitive filter as {@link trackArgs} applies to
   * its return value — nested objects, arrays, and non-primitives
   * are dropped, so you can't accidentally leak a whole state slice.
   */
  enrichTrack?: (args: TArgs, result: TResult) => Record<string, unknown>;
}

const registry = new Map<string, CommandSpec>();

export function register<TArgs, TResult>(spec: CommandSpec<TArgs, TResult>) {
  registry.set(spec.name, spec as unknown as CommandSpec);
}

export function unregister(name: string) {
  registry.delete(name);
}

export function get(name: string): CommandSpec | undefined {
  return registry.get(name);
}

export function list(): CommandSpec[] {
  return Array.from(registry.values());
}

/**
 * Pluck only the explicitly-whitelisted keys from the args object, and
 * sanity-check that each is a primitive (string/number/boolean/null).
 * Anything weirder (object, array, function) is dropped — keeps the
 * Mixpanel payload flat and the dashboard's auto-grouping working.
 */
function safeTrackArgs(args: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!keys.length || typeof args !== 'object' || args === null) return {};
  const out: Record<string, unknown> = {};
  const src = args as Record<string, unknown>;
  for (const key of keys) {
    if (!(key in src)) continue;
    const v = src[key];
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[key] = v;
    }
  }
  return out;
}

/**
 * Same primitive-only filter as {@link safeTrackArgs} but applied to
 * an arbitrary object returned from {@link CommandSpec.enrichTrack}.
 * Defensive: even if the callback returns a nested state slice, only
 * top-level primitives survive into the Mixpanel payload.
 */
function safeEnrichment(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Executes a registered command. Throws when the name is unknown so the
 * caller (the chat tool loop) can surface the failure as a `tool_result`
 * with an explanatory error string back to the model.
 *
 * <p>Fires a {@code Command Dispatched} Mixpanel event after the handler
 * resolves (or throws — failures are tracked with {@code success: false}
 * so we can spot recurring failure modes without having to instrument
 * each command individually).
 */
export async function dispatch(
  name: string,
  args: unknown,
  source: CommandSource = 'ui',
): Promise<unknown> {
  const cmd = registry.get(name);
  if (!cmd) {
    // Unknown command — track the miss so we can see when the
    // assistant emits a tool that isn't registered (the prompt's
    // tool list drifting from the actual registry).
    track('Command Dispatched', {
      command: name,
      source,
      success: false,
      error: 'unknown_command',
    });
    throw new Error(`Unknown command: ${name}`);
  }
  const t0 = performance.now();
  try {
    const result = await cmd.handler(args as never);
    if (!cmd.silent) {
      let enrichment: Record<string, unknown> = {};
      if (cmd.enrichTrack) {
        try {
          enrichment = safeEnrichment(cmd.enrichTrack(args as never, result as never));
        } catch {
          // Don't let a buggy enrichTrack take down the dispatch — the
          // user action already succeeded. Drop the enrichment silently
          // and ship the bare event so we still see the dispatch.
        }
      }
      track('Command Dispatched', {
        command: name,
        source,
        success: true,
        durationMs: Math.round(performance.now() - t0),
        ...safeTrackArgs(args, cmd.trackArgs ?? []),
        ...enrichment,
      });
    }
    return result;
  } catch (err) {
    if (!cmd.silent) {
      track('Command Dispatched', {
        command: name,
        source,
        success: false,
        durationMs: Math.round(performance.now() - t0),
        error: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
        ...safeTrackArgs(args, cmd.trackArgs ?? []),
      });
    }
    throw err;
  }
}
