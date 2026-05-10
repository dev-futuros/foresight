import { useEffect, useRef } from 'react';
import { get, register, unregister, type CommandSpec } from './commandBus';

/**
 * Loose alias for "any registered command, regardless of how its caller has
 * narrowed TArgs/TResult". The bus erases generics at registration time
 * ({@code register} casts to {@link CommandSpec}), so the factory can return
 * a heterogeneous list of specs — each can declare its own argument shape
 * for its own type-checking convenience without forcing every entry to share
 * the default {@code Record<string, unknown>} default.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCommandSpec = CommandSpec<any, any>;

/**
 * Mounts a group of assistant commands for the lifetime of the calling
 * component. The {@code factory} runs on every render so handlers, labels
 * and previews always see the freshest closure values — but the bus is wired
 * exactly once on mount and torn down on unmount.
 *
 * <p>This replaces the boilerplate that pages used to hand-roll
 * (a {@code useEffect} with empty deps, a fistful of refs to pin handlers,
 * and a manual {@code unregister} list in the cleanup). The set of command
 * <em>names</em> is captured from the first factory invocation and is treated
 * as static across the mount — adding/removing commands at runtime requires
 * remounting the host component.
 *
 * <p>Commands registered here override any command of the same name that was
 * registered earlier. The earlier registration is restored automatically on
 * unmount so shell-level commands (like {@code goTo}) keep working when a
 * page-scoped override goes away.
 */
export function useCommands(factory: () => AnyCommandSpec[]) {
  // Latest factory closure — refreshed every render so handlers always see
  // the current state. The body of useEffect calls factoryRef.current() at
  // dispatch-time, never at mount-time.
  const factoryRef = useRef(factory);
  factoryRef.current = factory;

  useEffect(() => {
    const initial = factoryRef.current();
    const names = initial.map((s) => s.name);

    // Snapshot whatever was registered under these names before us so we can
    // put it back on unmount. Without this, a page that overrides a shell
    // command (e.g. NewReportPage's `goTo`) would leave the assistant
    // command-less the moment the user navigates away.
    const previous = new Map<string, AnyCommandSpec | undefined>();

    for (const spec of initial) {
      // Capture before we overwrite — `register` uses a Map so we'd lose
      // the previous binding otherwise.
      previous.set(spec.name, get(spec.name));

      // The wrappers re-resolve through factoryRef on every call so the bus
      // always sees the current closure; mode is captured at mount because it
      // determines the auto/confirm branch in useChat and is treated as static.
      register({
        name: spec.name,
        mode: spec.mode,
        label:
          spec.label != null
            ? (args: Record<string, unknown>): string =>
                resolveLatest(spec.name).label?.(args) ?? spec.name
            : undefined,
        preview:
          spec.preview != null
            ? (args: Record<string, unknown>): string =>
                resolveLatest(spec.name).preview?.(args) ?? ''
            : undefined,
        handler: (args: Record<string, unknown>) =>
          resolveLatest(spec.name).handler(args),
      });
    }

    return () => {
      for (const name of names) {
        const prev = previous.get(name);
        if (prev) {
          register(prev);
        } else {
          unregister(name);
        }
      }
    };

    /** Re-resolves a spec by name from the *current* factory output, so the
     *  registered wrappers always invoke the freshest handler/label/preview. */
    function resolveLatest(name: string): AnyCommandSpec {
      const latest = factoryRef.current();
      const found = latest.find((s) => s.name === name);
      if (!found) {
        throw new Error(
          `Command "${name}" disappeared from useCommands factory; the set of names must be stable across renders.`,
        );
      }
      return found;
    }
    // Empty deps on purpose — the bus must be wired exactly once per mount.
    // Handlers stay fresh by re-resolving through factoryRef on every call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
