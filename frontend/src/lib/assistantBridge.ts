/**
 * One-way wizard → chat notification bridge.
 *
 * <p>The assistant only ever runs in response to a turn. When the wizard
 * completes an async action the user is waiting on — Global STEEP
 * generation, analysis completion, etc. — we want the assistant to weigh
 * in proactively ("dimensions are ready, want help refining them?")
 * instead of leaving the user staring at a silent chat.
 *
 * <p>This module is the bridge: the wizard calls {@link notifyAssistant}
 * with a short note describing what just happened; the chat component
 * registers a handler via {@link setAssistantNotifier} on mount; the
 * handler turns the note into a hidden user-side prompt that triggers an
 * assistant turn. The handler is responsible for any debouncing, busy-
 * guards, or "skip if the chat never opened" policy — this file is just
 * the wire.
 *
 * <p>A single handler at a time is supported (only one ChatAssistant is
 * ever mounted in {@code AppShell}); setting a new handler overwrites the
 * previous one. Calling {@link notifyAssistant} with no handler registered
 * is a no-op — fine for early-app or chat-never-opened states.
 */

export type AssistantNotifier = (note: string) => void;
export type AssistantResetter = () => void;

let current: AssistantNotifier | null = null;
let currentReset: AssistantResetter | null = null;

/** Register (or unregister with {@code null}) the chat's handler. Called
 *  from the chat component's mount effect. */
export function setAssistantNotifier(notifier: AssistantNotifier | null): void {
  current = notifier;
}

/** Wizard-side trigger. {@code note} is the synthetic prompt the chat
 *  forwards to the model (e.g. "Global STEEP generation just finished").
 *  Drops silently when no handler is registered. */
export function notifyAssistant(note: string): void {
  current?.(note);
}

/** Register the chat's reset handler. Paired with {@link resetAssistant}
 *  below — called from the chat component's mount effect alongside the
 *  notifier. */
export function setAssistantResetter(resetter: AssistantResetter | null): void {
  currentReset = resetter;
}

/** Wizard-side trigger to wipe the conversation. Called from the
 *  newReport command handler so a fresh report starts with a fresh
 *  chat — the previous report's brief, scenarios, and Q&A are no
 *  longer relevant to the new one. Drops silently when no handler is
 *  registered (e.g. chat hasn't been mounted yet). */
export function resetAssistant(): void {
  currentReset?.();
}
