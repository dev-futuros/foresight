/**
 * Single chokepoint for diagnostic logging from feature code.
 *
 * <p>Each method takes a {@code scope} string (e.g. "dashboard",
 * "analyze:summary", "pdfFit") that's wrapped in square brackets and
 * prepended to the message. This is just the convention the codebase
 * already used for raw {@code console.error} calls — the wrapper makes
 * it consistent and gives us a single place to evolve later (Sentry
 * breadcrumbs, log levels per-environment, in-app log overlay, etc.).
 *
 * <p>Levels:
 * <ul>
 *   <li>{@code debug} — dev-only. Tree-shaken from prod via
 *       {@code import.meta.env.DEV}. Use for chatty per-frame diagnostics
 *       (SSE stream open/close, cache hits, etc.) that would be noise
 *       to production users opening devtools.</li>
 *   <li>{@code warn} — always. Non-fatal anomalies worth surfacing in
 *       both dev and prod consoles so support can ask "open devtools,
 *       what do you see".</li>
 *   <li>{@code error} — always. Caught errors. Sentry capture stays
 *       separate — most React Query errors are already captured by the
 *       global QueryCache / MutationCache handlers; standalone catch
 *       blocks that need an explicit {@code Sentry.captureException}
 *       call should still do so.</li>
 * </ul>
 *
 * <p>This module IS the console abstraction, so the underlying calls
 * live here and nowhere else. The eslint config disables
 * {@code no-console} for this file via a per-file override and
 * promotes it to error everywhere else, so any new {@code console.*}
 * outside this file gets caught at lint time.
 */

const isDev = import.meta.env.DEV;

function format(scope: string, args: readonly unknown[]): unknown[] {
  return [`[${scope}]`, ...args];
}

export const logger = {
  /** Dev-only diagnostic. No-op in production builds. */
  debug(scope: string, ...args: unknown[]): void {
    if (isDev) {
      console.info(...format(scope, args));
    }
  },
  /** Non-fatal anomaly. Surfaces in dev AND prod consoles. */
  warn(scope: string, ...args: unknown[]): void {
    console.warn(...format(scope, args));
  },
  /** Caught error. Surfaces in dev AND prod consoles. Sentry capture
   *  is the caller's responsibility — most errors flow through React
   *  Query's cache handlers already. */
  error(scope: string, ...args: unknown[]): void {
    console.error(...format(scope, args));
  },
};
