import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useReports, useDeleteReport, useDeleteTranslation } from '../../hooks/useReports';
import {
  useExamples,
  useDeleteExample,
  useDeleteExampleTranslation,
  useDemoteExample,
} from '../../hooks/useExamples';
import { useIsDev } from '../../hooks/useAuth';
import ConfirmDialog from '../../components/ConfirmDialog';
import ExportModal, {
  type ExportFormat,
  type ExportLanguage,
} from '../../components/ExportModal';
import LoadingOverlay from '../../components/LoadingOverlay';
import ShareModal from '../../components/ShareModal';
import PromoteToExampleModal from '../../components/PromoteToExampleModal';
import '../../components/modal.css';
import api from '../../lib/api';
import { exportReportPdf } from '../../lib/exportPdf';
import { exportReportPpt } from '../../lib/exportPpt';
import { useTranslations } from '../translations/TranslationsContext';
import type {
  ExampleSummary,
  ReportResponse,
  ReportStatus,
  ReportSummary,
} from '../../types/api';
import './dashboard.css';

/** Supported translation targets — kept in sync with the backend's allow-list. */
const SUPPORTED_LANGUAGES: readonly ExportLanguage[] = ['es', 'en'] as const;

/** Action a card might be running. {@code null} when no card is busy. */
type ExportingState = { id: string; kind: 'pdf' | 'ppt' } | null;

/**
 * Unified card row — either a user-owned report or a global example.
 * Both kinds open under {@code /reports/:id} (the viewer falls back to
 * the example endpoint on 404), so the discriminator only affects
 * affordance gating: Share is on both; Delete/Promote/Demote depend on
 * kind + DEV role; translate chips fire either the report or the
 * example mutation depending on kind.
 */
type DashCard =
  | { kind: 'report'; row: ReportSummary }
  | { kind: 'example'; row: ExampleSummary };

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, refetch } = useReports();
  const examplesQuery = useExamples();
  const deleteReport = useDeleteReport();
  const deleteTranslation = useDeleteTranslation();
  const deleteExample = useDeleteExample();
  const deleteExampleTranslation = useDeleteExampleTranslation();
  const demoteExample = useDemoteExample();
  const isDev = useIsDev();
  const queryClient = useQueryClient();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteExampleId, setPendingDeleteExampleId] = useState<string | null>(null);
  const [pendingDemoteExampleId, setPendingDemoteExampleId] = useState<string | null>(null);
  const [shareTargetId, setShareTargetId] = useState<string | null>(null);
  const [shareTargetKind, setShareTargetKind] = useState<'report' | 'example'>('report');
  const [exportTargetId, setExportTargetId] = useState<string | null>(null);
  const [exportTargetKind, setExportTargetKind] = useState<'report' | 'example'>('report');
  const [promoteTargetId, setPromoteTargetId] = useState<string | null>(null);
  // Tracks which card (if any) is currently fetching+exporting. We only
  // allow one export at a time so the overlay doesn't get into a tangled
  // race; the UI disables the other export buttons on whichever card is
  // currently working.
  const [exporting, setExporting] = useState<ExportingState>(null);
  // Translation state is hoisted to the AppShell-level provider so it
  // survives navigation — a user who clicks `+ EN` and then leaves the
  // dashboard finds the translation still running (and the new chip
  // already in place) when they come back. The provider owns the
  // AbortControllers too; nothing here cancels them on unmount.
  const { translations, startTranslation } = useTranslations();

  const dateLocale = i18n.language === 'en' ? 'en-GB' : 'es-ES';

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(dateLocale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setPendingDeleteId(id);
  }

  function handleDeleteExample(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setPendingDeleteExampleId(id);
  }

  function handleShare(e: React.MouseEvent, id: string, kind: 'report' | 'example' = 'report') {
    e.preventDefault();
    e.stopPropagation();
    setShareTargetKind(kind);
    setShareTargetId(id);
  }

  function handlePromote(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setPromoteTargetId(id);
  }

  function handleDemoteExample(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setPendingDemoteExampleId(id);
  }

  async function confirmDemoteExample() {
    if (!pendingDemoteExampleId) return;
    const exampleId = pendingDemoteExampleId;
    setPendingDemoteExampleId(null);
    try {
      // Stay on the dashboard — the mutation's onSuccess invalidates
      // both lists, so the example card disappears and a new (private)
      // report card appears in place. The dev can open it if they want.
      await demoteExample.mutateAsync(exampleId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[dashboard] demote failed', err);
    }
  }

  /** Fetch the full report (with resultData), swap in the cached
   *  translation when needed, and run the export library. The card-level
   *  useReports query only carries summaries so we have to pull the
   *  heavy blob on demand — goes through queryClient.fetchQuery so the
   *  result is cached for any subsequent viewer / edit navigation.
   *
   *  <p>{@code language} is guaranteed to be in the report's
   *  availableLanguages set because the modal picker only exposes those
   *  — so the translate call here is always a cache hit. */
  async function handleExport(
    id: string,
    format: ExportFormat,
    language: ExportLanguage,
    kind: 'report' | 'example' = 'report',
  ) {
    if (exporting) return;
    setExporting({ id, kind: format });
    try {
      const base = kind === 'example' ? 'examples' : 'reports';
      const baseReport = await queryClient.fetchQuery<ReportResponse>({
        // Use a dedicated cache key per kind so the React Query cache
        // doesn't collide between a report id and an example id (rare,
        // since both are UUIDs, but cheap to guard).
        queryKey: [base, id, 'detail'],
        queryFn: async () => {
          const res = await api.get<ReportResponse>(`/${base}/${id}`);
          return res.data;
        },
      });
      // Swap to the cached translation when the user picked a
      // non-primary language. /translate is cache-warm so this is a
      // fast round-trip — no Anthropic call. Same endpoint shape on
      // both /reports and /examples.
      const report =
        language === baseReport.primaryLanguage
          ? baseReport
          : await (async () => {
              const res = await api.post<{
                inputData: Record<string, unknown>;
                resultData: Record<string, unknown> | null;
              }>(`/${base}/${id}/translate`, null, { params: { targetLanguage: language } });
              return {
                ...baseReport,
                inputData: res.data.inputData,
                resultData: res.data.resultData,
              };
            })();
      // jspdf and pptxgenjs block the main thread; defer one tick so the
      // overlay paints before the work begins, matching the ReportPage
      // export pattern.
      await new Promise((r) => setTimeout(r, 0));
      if (format === 'pdf') await exportReportPdf(report, language);
      else exportReportPpt(report);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[dashboard] export failed', err);
    } finally {
      setExporting(null);
    }
  }

  function confirmDelete() {
    if (pendingDeleteId) deleteReport.mutate(pendingDeleteId);
    setPendingDeleteId(null);
  }

  function confirmDeleteExample() {
    if (pendingDeleteExampleId) deleteExample.mutate(pendingDeleteExampleId);
    setPendingDeleteExampleId(null);
  }

  // Stats are computed from the loaded page (default size 20) and cover
  // ONLY the caller's own reports — examples are demonstration content
  // and shouldn't count toward "completed" or "in progress" totals.
  const userReports = data?.content ?? [];
  const exampleRows = examplesQuery.data ?? [];

  // The unified card list — examples first (they're the "what does a
  // finished foresight report look like?" anchor and benefit from being
  // above the fold), followed by the user's own reports in
  // createdAt-desc order. Each row carries its `kind` so the renderer
  // can switch on affordances and routing without duplicate JSX.
  const cards = useMemo<DashCard[]>(
    () => [
      ...exampleRows.map((row) => ({ kind: 'example' as const, row })),
      ...userReports.map((row) => ({ kind: 'report' as const, row })),
    ],
    [exampleRows, userReports],
  );
  const total = data?.totalElements ?? 0;
  const completed = userReports.filter((r) => r.status === 'COMPLETED').length;
  const inProgress = userReports.filter((r) => r.status === 'DRAFT' || r.status === 'PROCESSING').length;
  const failed = userReports.filter((r) => r.status === 'FAILED').length;

  const hasReports = cards.length > 0;

  return (
    <div className="dashboard">
      <main className="dashboard-main">
        <div className="db-header">
          <div>
            <div className="eyebrow">{t('dashboard.eyebrow')}</div>
            <h1 className="page-title">{t('dashboard.title')}</h1>
          </div>
          <div className="db-actions">
            <Link to="/reports/new" className="btn btn-primary">
              {t('dashboard.newReport')}
            </Link>
          </div>
        </div>

        {!isLoading && !isError && (
          <div className="db-stats">
            <div className="db-stat">
              <div className="db-stat-n">{total}</div>
              <div className="db-stat-l">{t('dashboard.stat.reports')}</div>
            </div>
            <div className="db-stat">
              <div className="db-stat-n">{completed}</div>
              <div className="db-stat-l">{t('dashboard.stat.completed')}</div>
            </div>
            <div className="db-stat">
              <div className="db-stat-n">{inProgress}</div>
              <div className="db-stat-l">{t('dashboard.stat.inProgress')}</div>
            </div>
            <div className="db-stat">
              <div className="db-stat-n">{failed}</div>
              <div className="db-stat-l">{t('dashboard.stat.failed')}</div>
            </div>
          </div>
        )}

        <p className="section-label">{t('dashboard.savedLabel')}</p>

        {isLoading && <div className="db-loading">{t('dashboard.loading')}</div>}

        {isError && (
          <div className="db-error" role="alert">
            <span>{t('dashboard.errorLoading')}</span>
            <button type="button" className="btn-retry" onClick={() => refetch()}>
              {t('common.retry')}
            </button>
          </div>
        )}

        {!isLoading && !isError && !hasReports && (
          <div className="db-empty">
            <div className="db-empty-icon">◈</div>
            <h2 className="db-empty-title">{t('dashboard.emptyTitle')}</h2>
            <p className="db-empty-desc">{t('dashboard.emptyDesc')}</p>
          </div>
        )}

        {!isLoading && !isError && hasReports && (
          <div className="db-reports-grid">
            {cards.map((card) => {
              const { row } = card;
              const isExample = card.kind === 'example';
              const status: ReportStatus = isExample ? 'COMPLETED' : card.row.status;
              const isDraft = status === 'DRAFT';
              const title = row.title;
              const id = row.id;
              const createdAt = row.createdAt;
              // Drafts open the wizard in edit mode; everything else goes
              // straight to the viewer. Examples share the same /reports/:id
              // route — `useReport` falls back to the examples endpoint on
              // 404, and the viewer gates write affordances on the
              // `source` discriminator that fallback returns.
              const target = isDraft
                ? `/reports/${id}/edit`
                : `/reports/${id}`;
              const canExport = !isDraft && status !== 'FAILED';
              const isBusyExporting = exporting?.id === id;
              const primaryLanguage =
                (row.primaryLanguage as ExportLanguage | undefined) ?? 'es';
              const availableLanguages = ((row.availableLanguages as ExportLanguage[] | undefined) ??
                [primaryLanguage]) as ExportLanguage[];
              const translation = translations[id];
              const isTranslating = !!translation;
              // Determinate progress percentage. The translated envelope
              // is roughly the same length as the source, so
              // {@code outputChars / inputChars} is a sensible 0..1
              // proxy. Capped at 99 so the bar doesn't sit at 100 while
              // waiting for the `done` frame + cache write. Starts at 0
              // before the first SSE frame lands so the bar is always
              // determinate — the user sees the real translation
              // progress, same as the modal version used to do.
              const translatePct =
                translation?.progress && translation.progress.inputChars > 0
                  ? Math.max(
                      0,
                      Math.min(
                        99,
                        Math.round(
                          (translation.progress.outputChars / translation.progress.inputChars) *
                            100,
                        ),
                      ),
                    )
                  : 0;
              // Translate chips are only actionable for users who are
              // allowed to spend Anthropic budget: for examples that
              // means DEV-only; for the user's own reports, anyone can
              // (they're spending against their own row).
              const canActOnTranslations = isExample ? isDev : true;
              return (
                <Link
                  key={id}
                  to={target}
                  className={`db-report-card${isExample ? ' db-r-example' : ''}${
                    isTranslating ? ' db-r-card--translating' : ''
                  }`}
                  // Block navigation while a translation is in flight so
                  // the user doesn't accidentally leave the page and
                  // lose the visible progress feedback. The stream
                  // itself keeps running because the AbortController is
                  // hosted at the AppShell-level TranslationsProvider.
                  onClick={(e) => {
                    if (isTranslating) e.preventDefault();
                  }}
                >
                  <div className={`db-r-status ${status}`}>
                    {t(`dashboard.status.${status}` as `dashboard.status.${ReportStatus}`)}
                  </div>
                  <div className="db-r-name">
                    {title}
                    {isExample && (
                      <span className="db-r-badge">{t('dashboard.exampleBadge')}</span>
                    )}
                  </div>
                  <div className="db-r-date">{formatDate(createdAt)}</div>

                  {canExport && (
                    <div
                      className="db-r-langs"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {SUPPORTED_LANGUAGES.map((lng) => {
                        const isAvailable = availableLanguages.includes(lng);
                        const isPrimary = lng === primaryLanguage;
                        if (isAvailable) {
                          return (
                            <span
                              key={lng}
                              className={`db-r-lang-chip${isPrimary ? ' db-r-lang-chip--primary' : ''}`}
                              title={
                                isPrimary
                                  ? t('dashboard.lang.primary', { defaultValue: 'Primary language' })
                                  : t('dashboard.lang.available', { defaultValue: 'Translated' })
                              }
                            >
                              {lng.toUpperCase()}
                              {/* Primary language has no delete affordance — it's
                                  the source of truth, not a cached translation.
                                  For examples, only DEVs can delete a
                                  translation; for the user's own reports it's
                                  always the owner. */}
                              {!isPrimary && canActOnTranslations && (
                                <button
                                  type="button"
                                  className="db-r-lang-chip-x"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (isExample) {
                                      deleteExampleTranslation.mutate({ id, language: lng });
                                    } else {
                                      deleteTranslation.mutate({ id, language: lng });
                                    }
                                  }}
                                  disabled={
                                    isExample
                                      ? deleteExampleTranslation.isPending
                                      : deleteTranslation.isPending
                                  }
                                  aria-label={t('dashboard.lang.delete', {
                                    defaultValue: 'Delete {{lang}} translation',
                                    lang: lng.toUpperCase(),
                                  })}
                                  title={t('dashboard.lang.delete', {
                                    defaultValue: 'Delete {{lang}} translation',
                                    lang: lng.toUpperCase(),
                                  })}
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          );
                        }
                        // Translate-to button only renders when the user
                        // is allowed to act on this row's translations
                        // (DEV on examples, anyone on own reports). For
                        // non-DEV users looking at examples, the missing
                        // language simply doesn't appear in the chip row.
                        if (!canActOnTranslations) return null;
                        return (
                          <button
                            key={lng}
                            type="button"
                            className="db-r-lang-translate"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              startTranslation(id, lng, isExample ? 'example' : 'report');
                            }}
                            disabled={isTranslating}
                            title={t('dashboard.lang.translateTo', {
                              defaultValue: 'Translate to {{lang}}',
                              lang: lng.toUpperCase(),
                            })}
                          >
                            + {lng.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Action row — Export (everyone), Share (own reports
                      only for V1), Promote-to-Example (DEV on own
                      reports), Delete (owner on own reports; DEV on
                      examples). */}
                  <div
                    className="db-r-actions"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canExport && (
                      <button
                        className="db-r-btn"
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setExportTargetKind(isExample ? 'example' : 'report');
                          setExportTargetId(id);
                        }}
                        disabled={isBusyExporting}
                        title={t('dashboard.actions.export')}
                      >
                        <svg className="db-r-btn-ico" aria-hidden>
                          <use href="#i-dl" />
                        </svg>
                        {isBusyExporting ? '…' : t('dashboard.actions.export')}
                      </button>
                    )}
                    {canExport && (
                      <button
                        className="db-r-btn"
                        type="button"
                        onClick={(e) =>
                          handleShare(e, id, isExample ? 'example' : 'report')
                        }
                        title={t('dashboard.actions.share')}
                      >
                        <svg className="db-r-btn-ico" aria-hidden>
                          <use href="#i-share" />
                        </svg>
                        {t('dashboard.actions.share')}
                      </button>
                    )}
                    {/* Promote-to-Example — DEV only, only on the user's
                        own completed reports. Examples don't promote
                        themselves. */}
                    {canExport && !isExample && isDev && (
                      <button
                        className="db-r-btn"
                        type="button"
                        onClick={(e) => handlePromote(e, id)}
                        title={t('dashboard.actions.promote', {
                          defaultValue: 'Promote to example',
                        })}
                      >
                        ★ {t('dashboard.actions.promote', { defaultValue: 'Example' })}
                      </button>
                    )}
                    {/* Delete: the user's own reports for everyone; for
                        examples only DEV users. */}
                    {!isExample && (
                      <button
                        className="db-r-btn danger"
                        type="button"
                        onClick={(e) => handleDelete(e, id)}
                        title={t('dashboard.deleteTitle')}
                      >
                        <svg className="db-r-btn-ico" aria-hidden>
                          <use href="#i-trash" />
                        </svg>
                        {t('dashboard.actions.delete')}
                      </button>
                    )}
                    {/* Demote — DEV-only on examples. Converts the
                        example back into a private report owned by the
                        calling dev. Paired with the Promote button on
                        report cards so the example <> report toggle
                        feels symmetrical. Iteration loop: ↩ Report,
                        edit, ★ Example. */}
                    {isExample && isDev && (
                      <button
                        className="db-r-btn"
                        type="button"
                        onClick={(e) => handleDemoteExample(e, id)}
                        title={t('dashboard.actions.demote', {
                          defaultValue: 'Convert back to a private report',
                        })}
                      >
                        ↩ {t('dashboard.actions.demote', { defaultValue: 'Report' })}
                      </button>
                    )}
                    {isExample && isDev && (
                      <button
                        className="db-r-btn danger"
                        type="button"
                        onClick={(e) => handleDeleteExample(e, id)}
                        title={t('dashboard.deleteExampleTitle', {
                          defaultValue: 'Delete example',
                        })}
                      >
                        <svg className="db-r-btn-ico" aria-hidden>
                          <use href="#i-trash" />
                        </svg>
                        {t('dashboard.actions.delete')}
                      </button>
                    )}
                  </div>

                  {/* Per-card translation overlay — covers the card and
                      blocks pointer events while the stream is in
                      flight. Bar is always determinate: starts at 0%
                      before the first SSE frame, fills in as
                      outputChars / inputChars ratio climbs. */}
                  {isTranslating && (
                    <div
                      className="db-r-translate-overlay"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      <div className="db-r-translate-label">
                        {t('dashboard.lang.translatingTo', {
                          defaultValue: 'Translating to {{lang}}…',
                          lang: translation.language.toUpperCase(),
                        })}
                      </div>
                      <div
                        className="db-r-translate-bar"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={translatePct}
                      >
                        <div
                          className="db-r-translate-fill"
                          style={{ width: `${translatePct}%` }}
                        />
                      </div>
                      <div className="db-r-translate-meta">
                        {translation.progress
                          ? `${translation.progress.outputChars.toLocaleString()} / ${translation.progress.inputChars.toLocaleString()} (${translatePct}%)`
                          : `${translatePct}%`}
                      </div>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title={t('modals.deleteReport.title')}
        description={t('modals.deleteReport.description')}
        confirmLabel={t('modals.deleteReport.confirm')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
      <ConfirmDialog
        open={pendingDeleteExampleId !== null}
        title={t('modals.deleteExample.title', { defaultValue: 'Delete example' })}
        description={t('modals.deleteExample.description', {
          defaultValue:
            'This action removes the example for every user. This cannot be undone.',
        })}
        confirmLabel={t('modals.deleteExample.confirm', { defaultValue: 'Delete example' })}
        destructive
        onConfirm={confirmDeleteExample}
        onCancel={() => setPendingDeleteExampleId(null)}
      />
      <ConfirmDialog
        open={pendingDemoteExampleId !== null}
        title={t('modals.demoteExample.title', { defaultValue: 'Demote example?' })}
        description={t('modals.demoteExample.description', {
          defaultValue:
            'This converts the example into a private report owned by you. The example will be removed for every user, and any share links pointing at it will stop working. You can re-promote the new report afterwards.',
        })}
        confirmLabel={t('modals.demoteExample.confirm', { defaultValue: 'Demote' })}
        onConfirm={() => void confirmDemoteExample()}
        onCancel={() => setPendingDemoteExampleId(null)}
      />
      <ShareModal
        open={shareTargetId !== null}
        reportId={shareTargetId ?? ''}
        kind={shareTargetKind}
        onClose={() => setShareTargetId(null)}
      />
      <PromoteToExampleModal
        open={promoteTargetId !== null}
        reportId={promoteTargetId ?? ''}
        onClose={() => setPromoteTargetId(null)}
      />
      <ExportModal
        open={exportTargetId !== null}
        reportId={exportTargetId ?? ''}
        kind={exportTargetKind}
        onClose={() => setExportTargetId(null)}
        onExport={(format, language) => {
          if (exportTargetId) {
            void handleExport(exportTargetId, format, language, exportTargetKind);
          }
        }}
      />
      <LoadingOverlay
        open={exporting !== null}
        text={
          exporting?.kind === 'pdf'
            ? t('modals.export.pdf')
            : exporting?.kind === 'ppt'
              ? t('modals.export.ppt')
              : t('dashboard.exporting')
        }
      />
    </div>
  );
}
