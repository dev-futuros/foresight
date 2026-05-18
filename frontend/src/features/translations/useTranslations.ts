import { createContext, useContext } from 'react';
import type { TranslateProgress } from '../report/api';
import type { ExportLanguage } from '../../components/ExportModal';

/**
 * Per-report translation state. {@code progress} is {@code null} until the
 * first SSE frame lands; consumers (today: the dashboard cards) render an
 * indeterminate hint then flip to a determinate {@code outputChars /
 * inputChars} bar once frames start arriving.
 */
export interface TranslationState {
  language: ExportLanguage;
  progress: TranslateProgress | null;
  /** Whether this translation targets the user's own report or a shared
   *  example. Kept on the state row so the {@code .finally} handler
   *  invalidates the right React Query cache without re-deriving it
   *  from the id. */
  kind: 'report' | 'example';
}

/**
 * Optional callbacks the caller wires into a translation. Fire-and-forget by
 * default; pass these when you want to react to the terminal state without
 * subscribing to the {@link TranslationState} map (e.g. "translate, then
 * navigate the user to the report in that language" on the dashboard).
 *
 * <p>{@code onSuccess} fires once the backend has persisted the translation
 * AND the React Query cache has been invalidated, so any subsequent fetch
 * will see the freshly-translated payload.
 *
 * <p>{@code onError} fires on stream failure (excluding deliberate abort).
 */
export interface TranslationCallbacks {
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}

export interface TranslationsContextValue {
  /** Snapshot of in-flight translations, keyed by report id. */
  translations: Record<string, TranslationState>;
  /**
   * Kick off a streaming translation for the given report. The fetch lives
   * on this provider, not on the calling page, so the work survives the
   * caller's unmount — the user can leave the dashboard, browse the report
   * they just clicked, come back, and still see the progress bar (and the
   * fresh chip once it lands).
   *
   * <p>Idempotent: a second call for a report that's already translating is
   * a no-op (the original callbacks remain in force; new ones are dropped).
   */
  startTranslation: (
    id: string,
    language: ExportLanguage,
    kind?: 'report' | 'example',
    callbacks?: TranslationCallbacks,
  ) => void;
}

export const TranslationsContext = createContext<TranslationsContextValue | null>(null);

/**
 * Read the dashboard translation state and kick off new translations.
 * Must be called inside a {@link TranslationsProvider}.
 */
export function useTranslations(): TranslationsContextValue {
  const ctx = useContext(TranslationsContext);
  if (!ctx) {
    throw new Error('useTranslations must be used inside <TranslationsProvider>');
  }
  return ctx;
}
