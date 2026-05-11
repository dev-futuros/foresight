import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  translateReportStream,
  type TranslateProgress,
} from '../../hooks/useReports';
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
}

interface TranslationsContextValue {
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
   * a no-op.
   */
  startTranslation: (reportId: string, language: ExportLanguage) => void;
}

const TranslationsContext = createContext<TranslationsContextValue | null>(null);

/**
 * Hosts the dashboard's translation state. Lives at the app-shell level so
 * navigating between routes (dashboard ↔ report viewer ↔ account) doesn't
 * tear down in-flight streams. The cleanup runs once when the shell finally
 * unmounts (sign-out / hard navigation away from the app).
 *
 * <p>State shape is a plain object keyed by report id. Many cards can be
 * translating in parallel, each carries its own {@link AbortController}
 * (kept in a ref so cancellation never re-renders the consumer tree).
 */
export function TranslationsProvider({ children }: PropsWithChildren) {
  const [translations, setTranslations] = useState<Record<string, TranslationState>>({});
  const abortRef = useRef<Map<string, AbortController>>(new Map());
  const queryClient = useQueryClient();

  // Deliberately NO unmount-cleanup effect here. The whole point of
  // lifting this state above the dashboard is that user navigation
  // doesn't cancel translations in flight. The fetch reader keeps
  // draining, the backend keeps streaming, and the final `done` event
  // triggers the cache persist + list invalidate even if no React
  // subtree was listening at that exact moment.

  const startTranslation = useCallback(
    (reportId: string, language: ExportLanguage) => {
      // Read + write the duplicate guard from inside the setter so we
      // don't have to depend on `translations` in the callback's deps
      // (which would re-create the handler — and break referential
      // stability — on every progress frame).
      let shouldStart = false;
      setTranslations((prev) => {
        if (prev[reportId]) return prev;
        shouldStart = true;
        return { ...prev, [reportId]: { language, progress: null } };
      });
      if (!shouldStart) return;

      const controller = new AbortController();
      abortRef.current.set(reportId, controller);

      translateReportStream({
        id: reportId,
        targetLanguage: language,
        onProgress: (p) =>
          setTranslations((prev) =>
            prev[reportId] && prev[reportId].language === language
              ? { ...prev, [reportId]: { language, progress: p } }
              : prev,
          ),
        signal: controller.signal,
      })
        .then(() => {
          // Backend has just persisted the translation; refresh the list
          // so any visible card flips its chip from "+ EN" to "EN" without
          // a hard reload. Detail rows get invalidated too in case the
          // user is sitting on the report page in another tab.
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        })
        .catch((err: unknown) => {
          if ((err as Error)?.name === 'AbortError') return;
          // eslint-disable-next-line no-console
          console.error('[translations] stream failed', err);
        })
        .finally(() => {
          abortRef.current.delete(reportId);
          setTranslations((prev) => {
            const next = { ...prev };
            delete next[reportId];
            return next;
          });
        });
    },
    [queryClient],
  );

  return (
    <TranslationsContext.Provider value={{ translations, startTranslation }}>
      {children}
    </TranslationsContext.Provider>
  );
}

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
