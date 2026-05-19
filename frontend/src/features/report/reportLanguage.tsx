/**
 * Two-language model for the report viewer.
 *
 * <p>The app has two independent language concepts:
 * <ul>
 *   <li><b>Primary language</b> — the user's profile preference,
 *       managed by {@code AccountModal} and stored on the global
 *       {@code i18n.language}. Drives the Stepper, TopBar,
 *       AppFooter, AccountMenu, ChatAssistant, every modal, every
 *       dialog, the wizard, and everything else by default.</li>
 *   <li><b>Report language</b> — the report's currently-displayed
 *       language, driven by the in-viewer pill on
 *       {@code /reports/:id}. Independent of the global; the user
 *       can be reading an English report while their profile
 *       preference is Spanish, and the rest of the app stays in
 *       Spanish.</li>
 * </ul>
 *
 * <p><b>Opt-in by design.</b> Components default to primary (plain
 * {@code useTranslation()}). Components that should follow the
 * report language explicitly call {@link useReportTranslation}.
 * That makes the boundary visible in every file — no "global
 * magically changes underneath me" surprises.
 *
 * <p>Implementation: NO i18n state is mutated. The context just
 * carries {@code activeLang} as a string. {@link useReportTranslation}
 * uses {@code i18n.getFixedT(lng)}, which is the documented
 * react-i18next way to get a {@code t} bound to a specific language
 * without touching the global {@code i18n.language} pointer.
 * {@code getFixedT} is a pure function — no event subscriptions, no
 * side effects, no risk of leak across components.
 */
import { createContext, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

/**
 * Internal context — exported only so {@code ReportPage} can wrap the
 * subtree it owns. Everything else goes through
 * {@link useReportTranslation}.
 */
export const ReportLanguageContext = createContext<string | undefined>(undefined);

/**
 * Returns a {@code t} bound to the active report language. Use inside
 * ReportContent and every tab — any component rendered as a child of
 * the {@code <ReportLanguageContext.Provider>} ReportPage installs.
 *
 * <p>Falls back to the global t (primary language) when called
 * outside the provider — defensive so a misplaced hook call doesn't
 * crash. ReportPage itself doesn't use this hook (its render runs
 * BEFORE the provider in its own JSX exists); it binds its own t via
 * {@code i18n.getFixedT(activeLang)} directly. Same underlying
 * mechanism, just without the context indirection.
 */
export function useReportTranslation(): { t: TFunction } {
  const lng = useContext(ReportLanguageContext);
  const { t: baseT, i18n } = useTranslation();
  // Memoise so the returned t identity stays stable as long as the
  // report language is stable — keeps downstream React.memo /
  // useMemo / useCallback deps from thrashing.
  const t = useMemo<TFunction>(
    () => (lng === undefined ? baseT : i18n.getFixedT(lng)),
    [baseT, i18n, lng],
  );
  return { t };
}
