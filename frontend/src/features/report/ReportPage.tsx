import { isLanguageCode, languageSpec } from '../../i18n/languages';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ReportLanguageContext } from './reportLanguage';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useReport, useTranslateReport } from './api';
import { useDemoteExample, useTranslateExample } from '../examples/api';
import { useIsDev } from '../account/api';
import { useSetStepper } from '../shell/useStepper';
import { useCommands } from '../../lib/useCommands';
import { dispatch as dispatchCommand } from '../../lib/commandBus';
import { useSetAssistantContext } from '../chat/useAssistantContext';
import type { ReportResultSnapshot } from '../chat/lib/buildAssistantSnapshot';
import { exportReportPdf } from './pdf';
import { exportReportPpt } from '../../lib/exportPpt';
import { exportReportHtml } from '../../lib/exportHtml';
import ExportModal, {
  type ExportFormat,
  type ExportLanguage,
  type ExportPdfTheme,
} from './components/ExportModal';
import LoadingOverlay from '../../components/LoadingOverlay';
import ShareModal from './components/ShareModal';
import PromoteToExampleModal from '../examples/components/PromoteToExampleModal';
import ConfirmDialog from '../../components/ConfirmDialog';
import ReportContent, { type InputProjection, type ResultData } from './ReportContent';
import '../../components/modal.css';
import type { ReportResponse } from '../../types/api';
import './report.css';

interface InputData {
  companyProfile?: {
    name?: string;
    sector?: string;
    size?: string;
    horizon?: string;
    market?: string;
    challenge?: string;
    strengths?: string;
    consultantName?: string;
    consultantCompany?: string;
    title?: string;
  };
  globalSteep?: Partial<Record<'S' | 'T' | 'E' | 'ENV' | 'P', string>>;
  steep?: Partial<{
    social: string;
    technological: string;
    economic: string;
    environmental: string;
    political: string;
  }>;
  horizon?: Partial<Record<'H1' | 'H2' | 'H3' | 'h1' | 'h2' | 'h3', string>>;
}

export default function ReportPage() {
  // ReportPage uses TWO t functions side-by-side:
  //   tPrimary — bound to the user's profile preference (global
  //              i18n.language). Used for text passed AS PROPS to
  //              modals/dialogs (LoadingOverlay's "Exporting…",
  //              ConfirmDialog's title/description/confirmLabel for
  //              the demote flow). Those components shouldn't follow
  //              the report language.
  //   t        — bound to activeLang via getFixedT (defined further
  //              down, after activeLang is computed). Used for the
  //              report viewer chrome (eyebrow, status badge, header
  //              buttons, in-viewer pill, date label).
  //
  // i18n is also captured here so the activeLang-bound t can be
  // built from i18n.getFixedT below.
  const { t: tPrimary, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: report, isLoading, isError, refetch } = useReport(id!);
  const translateReport = useTranslateReport();
  const translateExample = useTranslateExample();
  const demoteExample = useDemoteExample();
  const isDev = useIsDev();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [pendingDemote, setPendingDemote] = useState(false);

  // ── In-viewer language switcher ───────────────────────────────────
  // Resolution order for the language the user is currently reading in:
  //   1. {@code ?lang=XX} in the URL (explicit, beats everything — the
  //      switcher pill writes this; the dashboard chips do too).
  //   2. {@code localStorage["report-lang:<id>"]} (per-report
  //      preference — remembers the last language the user chose for
  //      THIS report across navigation).
  //   3. The report's primary language (the authored fallback).
  //
  // Writing the URL is what triggers the payload swap; we mirror that
  // write into localStorage so navigating away and back doesn't reset
  // the choice. Per-report keys (not a single global preference) keep
  // each report's "I'm reading this one in EN" memory independent.
  const [searchParams, setSearchParams] = useSearchParams();
  const langParam = searchParams.get('lang');
  const requestedLang: ExportLanguage | null = isLanguageCode(langParam) ? langParam : null;
  const primaryLang = report?.primaryLanguage ?? 'es';
  const availableLangs = useMemo<ExportLanguage[]>(
    () => (report?.availableLanguages as ExportLanguage[] | undefined) ?? [primaryLang],
    [report?.availableLanguages, primaryLang],
  );

  // Stored preference. Read once via {@code useState} initialiser so we
  // don't slam {@code localStorage} on every render. Updated via
  // {@code useEffect} below when the URL param changes.
  const storageKey = id ? `report-lang:${id}` : null;
  const [storedLang, setStoredLang] = useState<ExportLanguage | null>(() => {
    if (typeof window === 'undefined' || !storageKey) return null;
    try {
      const v = window.localStorage.getItem(storageKey);
      return isLanguageCode(v) ? v : null;
    } catch {
      return null;
    }
  });

  const activeLang: ExportLanguage = (() => {
    if (requestedLang && availableLangs.includes(requestedLang)) return requestedLang;
    if (storedLang && availableLangs.includes(storedLang)) return storedLang;
    return primaryLang;
  })();

  // Bind t to activeLang via getFixedT — a pure function call, no
  // subscription, no global state mutation. ReportPage uses this t
  // directly for its own header chrome (eyebrow, status badge,
  // header buttons, in-viewer pill, date label). Child components
  // (ReportContent + every tab) call {@code useReportTranslation}
  // which reads activeLang from the {@code ReportLanguageContext}
  // we provide at the bottom of this return — same activeLang,
  // same underlying getFixedT mechanism. ReportPage takes the
  // direct path here because its own JSX renders BEFORE the
  // provider is installed (chicken-and-egg).
  const t = useMemo(() => i18n.getFixedT(activeLang), [i18n, activeLang]);

  /**
   * Write the user's chosen language to localStorage AND the URL.
   * Called from the switcher pill. We persist every explicit choice —
   * including primary — so toggling back to primary actually clears
   * any older stored preference. Without this, a user who reads in EN,
   * comes back, sees EN, and clicks ES to switch would still see EN
   * on their next visit (the URL-only path leaves localStorage on
   * EN).
   */
  function chooseLanguage(lng: ExportLanguage) {
    const next = new URLSearchParams(searchParams);
    if (lng === primaryLang) next.delete('lang');
    else next.set('lang', lng);
    setSearchParams(next, { replace: true });
    if (storageKey && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(storageKey, lng);
        setStoredLang(lng);
      } catch {
        /* private-browsing / storage-disabled — no-op. */
      }
    }
  }

  // Mirror URL-driven changes (e.g. arriving at /reports/:id?lang=en
  // from a dashboard chip click, or from a shared link) into
  // localStorage too, so the preference survives subsequent navigation
  // without the user having to touch the switcher.
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    if (requestedLang && availableLangs.includes(requestedLang)) {
      try {
        window.localStorage.setItem(storageKey, requestedLang);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror URL-driven lang into storage-backed state so deep-linked arrivals stick across reloads
        setStoredLang(requestedLang);
      } catch {
        /* private-browsing / storage-disabled — no-op. */
      }
    }
  }, [storageKey, requestedLang, availableLangs]);
  const needsTranslationFetch = report != null && activeLang !== primaryLang;
  // React Query handles per-(id × lang) caching for us: switching back
  // to a previously-fetched language is instant. The endpoint is
  // server-side cache-warm so even a "first fetch" round-trip is fast.
  const translationQuery = useQuery<{
    inputData: Record<string, unknown>;
    resultData: Record<string, unknown> | null;
  }>({
    queryKey: [
      report?.source === 'example' ? 'examples' : 'reports',
      id,
      'translation',
      activeLang,
    ],
    queryFn: async () => {
      const base = report?.source === 'example' ? 'examples' : 'reports';
      const res = await api.post<{
        inputData: Record<string, unknown>;
        resultData: Record<string, unknown> | null;
      }>(`/${base}/${id}/translate`, null, { params: { targetLanguage: activeLang } });
      return res.data;
    },
    enabled: needsTranslationFetch,
    staleTime: Infinity,
  });

  const isExample = report?.source === 'example';

  // Surface the wizard's 6-step indicator with step 6 ("Resultados") active.
  // Steps 1–4 navigate back into the wizard in edit mode so the user can
  // tweak inputs and regenerate. Step 5 is the analysis loading marker —
  // marked clickable:false because there's no real page behind it.
  //
  // For examples the stepper is the same — the wizard route loads the
  // example via the useReport fallback and renders the inputs in
  // read-only-ish mode (changes don't persist back to the example).
  // This lets users explore an example's inputs the same way they'd
  // explore their own report's inputs.
  const handleStepperSelect = useCallback(
    (n: number) => {
      if (n < 1 || n > 4) return;
      navigate(`/reports/${id}/edit?step=${n}`);
    },
    [id, navigate],
  );
  // Stepper labels follow PRIMARY — the stepper is app chrome that's
  // visible on both the wizard and the viewer; flipping it with the
  // viewer would make it blink between languages as the user moves
  // between routes.
  const stepperState = useMemo(
    () => ({
      steps: [
        { n: 1, label: tPrimary('wizard.steps.empresa') },
        { n: 2, label: tPrimary('wizard.steps.global') },
        { n: 3, label: tPrimary('wizard.steps.steep') },
        { n: 4, label: tPrimary('wizard.steps.horizon') },
        { n: 6, label: tPrimary('wizard.steps.results') },
      ],
      current: 6,
      maxReached: 6,
      onSelect: handleStepperSelect,
    }),
    [tPrimary, handleStepperSelect],
  );
  useSetStepper(stepperState);

  // Publish "currently-open report" to the assistant snapshot so the chat
  // knows about it even when the user navigated here through the UI (not
  // via an assistant command). Without this the snapshot defaults to
  // "step 1, empty form" and the assistant tells the user no report is
  // open. Cleared only on unmount (separate effect below) — clearing on
  // every dep change instead caused a brief undefined-context render
  // sandwiched between the old and new publish.
  const setAssistantContext = useSetAssistantContext();
  useEffect(() => {
    if (!report || !id) return;
    // Project the report's inputData back into the wizard shapes the
    // snapshot builder expects, so the COMPANY / GLOBAL STEEP / SECTORIAL
    // / HORIZON blocks reflect the open report instead of the (empty)
    // wizard defaults. Without this the assistant sees a blank form even
    // when the user is staring at a fully-generated report.
    const inp = (report.inputData ?? {}) as InputData;
    const cp = inp.companyProfile ?? {};
    const empresa = {
      name: cp.name ?? '',
      sector: cp.sector ?? '',
      size: cp.size ?? '',
      horizon: cp.horizon ?? '',
      market: cp.market ?? '',
      challenge: cp.challenge ?? '',
      strengths: cp.strengths ?? '',
      consultantName: cp.consultantName ?? '',
      consultantCompany: cp.consultantCompany ?? '',
      title: cp.title ?? '',
    };
    const gs = inp.globalSteep ?? {};
    const globalSteep = {
      S: gs.S ?? '',
      T: gs.T ?? '',
      E: gs.E ?? '',
      ENV: gs.ENV ?? '',
      P: gs.P ?? '',
    };
    const st = inp.steep ?? {};
    const steep = {
      social: st.social ?? '',
      technological: st.technological ?? '',
      economic: st.economic ?? '',
      environmental: st.environmental ?? '',
      political: st.political ?? '',
    };
    const hz = inp.horizon ?? {};
    const horizon = {
      H1: hz.H1 ?? hz.h1 ?? '',
      H2: hz.H2 ?? hz.h2 ?? '',
      H3: hz.H3 ?? hz.h3 ?? '',
    };
    setAssistantContext({
      currentStep: 6,
      empresa,
      globalSteep,
      steep,
      horizon,
      viewingReport: {
        id,
        title: report.title,
        status: report.status,
        primaryLanguage: report.primaryLanguage,
        availableLanguages: report.availableLanguages ?? [report.primaryLanguage],
        mode: 'viewer',
      },
      reportResult: (report.resultData ?? undefined) as ReportResultSnapshot | undefined,
    });
  }, [setAssistantContext, id, report]);
  useEffect(() => {
    return () => setAssistantContext(undefined);
  }, [setAssistantContext]);

  function runExport(
    kind: ExportFormat,
    language: ExportLanguage,
    includeLanguages?: ExportLanguage[],
    pdfTheme?: ExportPdfTheme,
  ) {
    if (!report) return;
    setExporting(kind);
    // Yield to React so the overlay paints before the work begins. PDF
    // export awaits font loading (brand TTFs registered with jsPDF).
    setTimeout(async () => {
      try {
        if (kind === 'pdf') {
          const exportReport = await resolveReportForLanguage(report, language);
          await exportReportPdf(exportReport, language, pdfTheme ?? 'dark');
        } else if (kind === 'ppt') {
          const exportReport = await resolveReportForLanguage(report, language);
          exportReportPpt(exportReport);
        } else {
          // HTML: bake the selected languages into the snapshot so the
          // recipient can switch among them in-page. {@link
          // exportReportHtml} materialises each via the cache-warm
          // translate endpoint internally; we pass the original report
          // plus the user's chosen default + include set.
          await exportReportHtml(
            report,
            language,
            isExample ? 'example' : 'report',
            includeLanguages,
          );
        }
      } finally {
        setExporting(null);
      }
    }, 0);
  }

  // Page-scoped overrides for the share/export commands. The shell-level
  // versions fall back to "open the report viewer first" — once we're on
  // that viewer these versions take over and open the actual modals.
  useCommands(() => [
    {
      name: 'shareReport',
      mode: 'auto',
      // Page-scoped override has no args (the report id is implicit
      // from the URL); enrichTrack adds the reportId + kind so the
      // dashboard can break down share intent by report type.
      enrichTrack: () => ({
        reportId: id ?? '',
        kind: isExample ? 'example' : 'report',
      }),
      handler: () => {
        setShareOpen(true);
        return 'Opened the share dialog.';
      },
    },
    {
      // Always opens the picker — assistant doesn't pre-pick format or
      // language. The user has full control of both selections in the
      // dialog. Mirrors the header's Export button exactly.
      name: 'exportReport',
      mode: 'auto',
      enrichTrack: () => ({
        reportId: id ?? '',
        kind: isExample ? 'example' : 'report',
      }),
      handler: () => {
        if (!report) {
          throw new Error('Report not loaded yet — try again in a moment.');
        }
        setExportOpen(true);
        return 'Opened the export dialog.';
      },
    },
    {
      // Translate the current report into a target language. Multi-
      // source by design: fires both from the export flow (when the
      // user picks a non-primary language) AND directly from the
      // assistant ("translate this to English"). Cache-hit path
      // resolves instantly; cache-miss hits Anthropic. The bus tracks
      // dispatch either way — we don't differentiate in analytics.
      name: 'requestTranslation',
      mode: 'auto',
      trackArgs: ['targetLanguage'],
      enrichTrack: () => ({
        reportId: id ?? '',
        kind: isExample ? 'example' : 'report',
      }),
      handler: async (args) => {
        const { targetLanguage } = args as { targetLanguage: ExportLanguage };
        if (!report) {
          throw new Error('Report not loaded yet — try again in a moment.');
        }
        if (targetLanguage === report.primaryLanguage) {
          return `Already in ${targetLanguage}; nothing to translate.`;
        }
        if (isExample) {
          await translateExample.mutateAsync({ id: report.id, targetLanguage });
        } else {
          await translateReport.mutateAsync({ id: report.id, targetLanguage });
        }
        return `Translation to ${targetLanguage} ready.`;
      },
    },
  ]);

  /**
   * Swap the report's payload to the cached translation for the picked
   * language, when it differs from the primary language. The export
   * picker only exposes already-materialised languages, so this call is
   * a guaranteed cache hit — no Anthropic round-trip needed. Hits
   * {@code /api/examples/.../translate} or {@code /api/reports/.../translate}
   * depending on the source.
   */
  async function resolveReportForLanguage(
    base: ReportResponse,
    language: ExportLanguage,
  ): Promise<ReportResponse> {
    if (language === base.primaryLanguage) return base;
    // Route through the command bus so the dispatch is tracked
    // automatically (Command Dispatched, command=requestTranslation)
    // and the same code path fires when the assistant requests a
    // translation via tool emission. The handler invokes the mutate
    // call; React Query caches the result, so we still read it back
    // here to update the export's local payload.
    await dispatchCommand('requestTranslation', { targetLanguage: language }, 'ui');
    const translated = isExample ? translateExample.data : translateReport.data;
    if (!translated) {
      // Defensive — the command's handler awaited the mutateAsync, so
      // the cache should be populated. Falling back to the original
      // payload here would silently show wrong-language content.
      throw new Error(`Translation to ${language} did not materialise.`);
    }
    return {
      ...base,
      inputData: translated.inputData,
      resultData: translated.resultData,
    };
  }

  async function confirmDemote() {
    if (!id) return;
    setPendingDemote(false);
    try {
      await demoteExample.mutateAsync(id);
      // The example was deleted, a new report (same UUID) was created
      // under the calling DEV's ownership. The cached query was
      // invalidated; refetching transparently flips `source` to
      // `'report'` and the page re-renders with the report affordances.
      // No navigation needed — same URL, new shape.
      await refetch();
    } catch (err) {
      console.error('[report] demote failed', err);
    }
  }

  if (isLoading) {
    return <div className="loading-screen">{t('report.loading')}</div>;
  }
  if (isError || !report) {
    return (
      <div className="report-page">
        <div className="report-main">
          <div className="err-box" style={{ margin: '64px auto 0' }}>
            {isError ? t('report.errorLoading') : t('report.notFound')}
          </div>
          {isError && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button type="button" className="btn" onClick={() => refetch()}>
                {t('common.retry')}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Pick the payload to render: the report's authored payload when
  // viewing in primary language, OR the cached translation when ?lang
  // points at a non-primary, already-available language. When the
  // translation is still loading we fall back to the primary payload
  // briefly so the page stays populated instead of flashing empty
  // tabs — the swap happens once the fetch resolves.
  const translatedPayload = translationQuery.data;
  const input = (
    needsTranslationFetch && translatedPayload ? translatedPayload.inputData : report.inputData
  ) as InputData;
  const result = (
    needsTranslationFetch && translatedPayload ? translatedPayload.resultData : report.resultData
  ) as ResultData | null;
  // `inputData.steep` is the sectorial STEEP captured in step 3 (the
  // wizard stores it under the bare `steep` key, not `sectorialSteep`).
  // Surface it to ReportContent under the demo-aligned name so the
  // Summary tab's STEEP echo block reads from a single typed projection.
  const inputProjection: InputProjection = {
    globalSteep: input?.globalSteep,
    // `input.steep` uses the wizard's localised key names
    // ({@code social}/{@code technological}/…); ReportContent's
    // {@code normalizeSteepKeys} accepts either shape at runtime, but
    // the static types only allow the canonical {@code S}/{@code T}/…
    // form. Cast to bridge the gap.
    sectorialSteep: input?.steep as InputProjection['sectorialSteep'],
  };

  // Date formatter follows activeLang — same scope as every t() in
  // this component. A user reading an English report sees the date
  // in English locale formatting regardless of their profile
  // preference.
  const formattedDate = new Date(report.createdAt).toLocaleDateString(
    languageSpec(activeLang).dateLocale,
    { day: '2-digit', month: 'short', year: 'numeric' },
  );

  return (
    // Provider scopes activeLang to ReportPage's children
    // (ReportContent + all 8 tab files via useReportTranslation).
    // Components OUTSIDE this provider (modals, dialogs, AppShell,
    // wizard) keep using plain useTranslation → primary language.
    <ReportLanguageContext.Provider value={activeLang}>
      <div className="report-page">
        <div className="report-main">
          <header className="report-header">
            <div className="report-heading">
              <p className="report-eyebrow">
                {isExample
                  ? t('example.eyebrow', { defaultValue: 'Example' })
                  : t('report.eyebrow')}
              </p>
              <h1 className="report-main-title">{report.title}</h1>
              <div className="report-meta">
                <span className={`status-badge ${report.status}`}>
                  {t(`report.status.${report.status}`)}
                </span>
                <span className="report-meta-item">
                  {t('report.meta.created', { date: formattedDate })}
                </span>
                {input?.companyProfile?.horizon && (
                  <span className="report-meta-item">
                    {t('report.meta.horizon', { value: input.companyProfile.horizon })}
                  </span>
                )}
                {input?.companyProfile?.sector && (
                  <span className="report-meta-item">· {input.companyProfile.sector}</span>
                )}
                {/* Switcher used to live here. It's now passed into
                  ReportContent's rightSlot so it sits aligned with the
                  sticky tab row on the right edge — stays accessible
                  during long-scroll reading and reads as a peer of
                  the navigation, not a header metadata chip. */}
              </div>
            </div>
            {/* Action buttons (Promote / Demote / Share / Export) read
                from tPrimary — they ACT ON the report from the app
                context (they open modals or trigger external actions)
                rather than describe report content. The modals
                themselves are also at primary, so the open-button and
                the opened-modal stay in the same language. */}
            <div className="report-actions">
              {/* Promote: DEV only, real reports only. Hidden for examples
                (which are already promoted) and for non-DEVs (gated at
                the backend too). */}
              {isDev && !isExample && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setPromoteOpen(true)}
                  disabled={!report.resultData}
                  title={tPrimary('dashboard.actions.promote', {
                    defaultValue: 'Promote to example',
                  })}
                >
                  ★ {tPrimary('dashboard.actions.promote', { defaultValue: 'Example' })}
                </button>
              )}
              {/* Demote: DEV only, examples only. Converts back to a
                private report owned by the calling DEV. Same URL keeps
                working (the new report inherits the example's UUID).
                Button label is the destination ("Report") so it pairs
                visually with the Promote button's "Example" label. */}
              {isDev && isExample && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setPendingDemote(true)}
                  title={tPrimary('dashboard.actions.demote', {
                    defaultValue: 'Convert back to a private report',
                  })}
                >
                  ↩ {tPrimary('dashboard.actions.demote', { defaultValue: 'Report' })}
                </button>
              )}
              <button
                type="button"
                className="btn"
                onClick={() => setShareOpen(true)}
                disabled={!report.resultData}
                title={tPrimary('share.triggerBtn')}
              >
                <svg className="db-r-btn-ico" aria-hidden>
                  <use href="#i-share" />
                </svg>
                {tPrimary('share.triggerBtn')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setExportOpen(true)}
                disabled={exporting !== null || !report.resultData}
                title={tPrimary('dashboard.actions.export')}
              >
                <svg className="db-r-btn-ico" aria-hidden>
                  <use href="#i-dl" />
                </svg>
                {exporting !== null ? '…' : tPrimary('dashboard.actions.export')}
              </button>
            </div>
          </header>

          {result ? (
            <ReportContent
              result={result}
              input={inputProjection}
              rightSlot={
                availableLangs.length > 1 ? (
                  <span
                    className="report-lang-switch"
                    role="tablist"
                    aria-label={t('report.lang.switcherAria', {
                      defaultValue: 'View in language',
                    })}
                  >
                    {availableLangs.map((lng) => {
                      const isActive = lng === activeLang;
                      return (
                        <button
                          key={lng}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          className={`report-lang-switch-btn${isActive ? ' active' : ''}`}
                          disabled={translationQuery.isFetching && !isActive}
                          onClick={() => chooseLanguage(lng)}
                        >
                          {lng.toUpperCase()}
                        </button>
                      );
                    })}
                  </span>
                ) : undefined
              }
            />
          ) : (
            // Legacy fallback: reports created with the old wizard flow may
            // still exist as DRAFT (no resultData). New flow always generates
            // before navigating, so this branch is for old data only.
            <div className="pending-state">
              <div className="pending-icon">◈</div>
              <h2 className="pending-title">{t('report.results.pendingTitle')}</h2>
              <p className="pending-desc">{t('report.results.pendingDesc')}</p>
            </div>
          )}
        </div>

        <LoadingOverlay
          open={exporting !== null}
          // tPrimary (primary language) — LoadingOverlay sits over the
          // report viewer chrome but is conceptually app chrome, not
          // report chrome. Pair with the export modal which also stays
          // at primary.
          text={
            exporting === 'pdf'
              ? tPrimary('modals.export.pdf')
              : exporting === 'html'
                ? tPrimary('modals.export.html', { defaultValue: 'Building standalone HTML…' })
                : tPrimary('modals.export.ppt')
          }
        />
        <ShareModal
          open={shareOpen}
          reportId={id!}
          kind={isExample ? 'example' : 'report'}
          onClose={() => setShareOpen(false)}
        />
        <ExportModal
          open={exportOpen}
          reportId={id!}
          kind={isExample ? 'example' : 'report'}
          // Pre-select the language the user is currently viewing so the
          // export defaults to what's on screen — they can still change
          // it in the modal, but the common case ("export what I'm
          // reading") becomes a one-click flow.
          initialLanguage={activeLang}
          onClose={() => setExportOpen(false)}
          onExport={(format, language, includeLanguages, pdfTheme) =>
            runExport(format, language, includeLanguages, pdfTheme)
          }
        />
        <PromoteToExampleModal
          open={promoteOpen}
          reportId={id!}
          onClose={() => setPromoteOpen(false)}
        />
        <ConfirmDialog
          open={pendingDemote}
          // tPrimary (primary language) — confirm dialogs are app
          // chrome, not report chrome. Same rationale as the modals.
          title={tPrimary('modals.demoteExample.title', { defaultValue: 'Demote example?' })}
          description={tPrimary('modals.demoteExample.description', {
            defaultValue:
              'This converts the example into a private report owned by you. The example will be removed for every user, and any share links pointing at it will stop working.',
          })}
          confirmLabel={tPrimary('modals.demoteExample.confirm', { defaultValue: 'Demote' })}
          onConfirm={() => void confirmDemote()}
          onCancel={() => setPendingDemote(false)}
        />
      </div>
    </ReportLanguageContext.Provider>
  );
}
