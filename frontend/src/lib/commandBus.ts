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
 */

export type CommandMode = 'auto' | 'confirm';

export interface CommandSpec<TArgs = Record<string, unknown>, TResult = unknown> {
  name: string;
  mode: CommandMode;
  /** Short label for the chip / activity entry. Falls back to name when omitted. */
  label?: (args: TArgs) => string;
  /** Optional richer preview shown inside confirm chips (e.g. for setField). */
  preview?: (args: TArgs) => string;
  handler: (args: TArgs) => Promise<TResult> | TResult;
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
 * Executes a registered command. Throws when the name is unknown so the
 * caller (the chat tool loop) can surface the failure as a `tool_result`
 * with an explanatory error string back to the model.
 */
export async function dispatch(name: string, args: unknown): Promise<unknown> {
  const cmd = registry.get(name);
  if (!cmd) {
    throw new Error(`Unknown command: ${name}`);
  }
  return cmd.handler(args as never);
}
