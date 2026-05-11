import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useReports, useDeleteReport, useDeleteTranslation } from '../../hooks/useReports';
import ConfirmDialog from '../../components/ConfirmDialog';
import ExportModal, {
  type ExportFormat,
  type ExportLanguage,
} from '../../components/ExportModal';
import LoadingOverlay from '../../components/LoadingOverlay';
import ShareModal from '../../components/ShareModal';
import '../../components/modal.css';
import api from '../../lib/api';
import { exportReportPdf } from '../../lib/exportPdf';
import { exportReportPpt } from '../../lib/exportPpt';
import { EXAMPLE_REPORT_TITLE } from '../../lib/exampleReport';
import { useTranslations } from '../translations/TranslationsContext';
import type { ReportResponse, ReportStatus } from '../../types/api';
import './dashboard.css';

/** Supported translation targets — kept in sync with the backend's allow-list. */
const SUPPORTED_LANGUAGES: readonly ExportLanguage[] = ['es', 'en'] as const;

/** Action a card might be running. {@code null} when no card is busy. */
type ExportingState = { id: string; kind: 'pdf' | 'ppt' } | null;

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, refetch } = useReports();
  const deleteReport = useDeleteReport();
  const deleteTranslation = useDeleteTranslation();
  const queryClient = useQueryClient();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [shareTargetId, setShareTargetId] = useState<string | null>(null);
  const [exportTargetId, setExportTargetId] = useState<string | null>(null);
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

  function handleShare(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setShareTargetId(id);
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
  async function handleExport(id: string, format: ExportFormat, language: ExportLanguage) {
    if (exporting) return;
    setExporting({ id, kind: format });
    try {
      const baseReport = await queryClient.fetchQuery<ReportResponse>({
        queryKey: ['reports', id],
        queryFn: async () => {
          const res = await api.get<ReportResponse>(`/reports/${id}`);
          return res.data;
        },
      });
      // Swap to the cached translation when the user picked a
      // non-primary language. /translate is cache-warm so this is a
      // fast round-trip — no Anthropic call.
      const report =
        language === baseReport.primaryLanguage
          ? baseReport
          : await (async () => {
              const res = await api.post<{
                inputData: Record<string, unknown>;
                resultData: Record<string, unknown> | null;
              }>(`/reports/${id}/translate`, null, { params: { targetLanguage: language } });
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

  // Stats are computed from the loaded page (default size 20). The "total" stat
  // uses the server-reported totalElements, but completed/in-progress/failed
  // counts are first-page approximations until pagination is wired up.
  //
  // The example card is hoisted to the top of the grid regardless of its
  // createdAt date — it's the user's "what does a finished report look
  // like?" anchor and should sit above their own work. The rest of the
  // list keeps the server-side createdAt-desc order.
  const reports = useMemo(() => {
    const all = data?.content ?? [];
    const example = all.filter((r) => r.title === EXAMPLE_REPORT_TITLE);
    const rest = all.filter((r) => r.title !== EXAMPLE_REPORT_TITLE);
    return [...example, ...rest];
  }, [data?.content]);
  const total = data?.totalElements ?? 0;
  const completed = reports.filter((r) => r.status === 'COMPLETED').length;
  const inProgress = reports.filter((r) => r.status === 'DRAFT' || r.status === 'PROCESSING').length;
  const failed = reports.filter((r) => r.status === 'FAILED').length;

  const hasReports = reports.length > 0;

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
            {reports.map((report) => {
              const isDraft = report.status === 'DRAFT';
              const isExample = report.title === EXAMPLE_REPORT_TITLE;
              // Drafts open the wizard in edit mode so the user lands back
              // on the step they left off. Completed reports go straight to
              // the viewer. The example is always a completed report (we
              // POST inputData + PATCH resultData on creation), so it
              // follows the COMPLETED path.
              const target = isDraft ? `/reports/${report.id}/edit` : `/reports/${report.id}`;
              // Share/export only make sense on reports that have a result.
              // Drafts are a wizard-in-progress; nothing to share yet.
              const canExport = !isDraft && report.status !== 'FAILED';
              const isBusyExporting = exporting?.id === report.id;
              const primaryLanguage =
                (report.primaryLanguage as ExportLanguage | undefined) ?? 'es';
              const availableLanguages = ((report.availableLanguages as ExportLanguage[] | undefined) ??
                [primaryLanguage]) as ExportLanguage[];
              const translation = translations[report.id];
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
              return (
                <Link
                  key={report.id}
                  to={target}
                  className={`db-report-card${isExample ? ' db-r-example' : ''}${
                    isTranslating ? ' db-r-card--translating' : ''
                  }`}
                  // Block navigation while a translation is in flight so
                  // the user doesn't accidentally leave the page and
                  // lose the visible progress feedback. The stream
                  // itself keeps running because the AbortController is
                  // refed at the dashboard level (the cleanup effect on
                  // unmount cancels it), but the UX is to stay put.
                  onClick={(e) => {
                    if (isTranslating) e.preventDefault();
                  }}
                >
                  <div className={`db-r-status ${report.status}`}>
                    {t(`dashboard.status.${report.status}` as `dashboard.status.${ReportStatus}`)}
                  </div>
                  <div className="db-r-name">
                    {report.title}
                    {isExample && (
                      <span className="db-r-badge">{t('dashboard.exampleBadge')}</span>
                    )}
                  </div>
                  <div className="db-r-date">{formatDate(report.createdAt)}</div>

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
                                  the source of truth for the report, not a
                                  cached translation. Every other available
                                  language gets an × that wipes the cached
                                  payload (the chip then flips back to "+ EN"). */}
                              {!isPrimary && (
                                <button
                                  type="button"
                                  className="db-r-lang-chip-x"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    deleteTranslation.mutate({ id: report.id, language: lng });
                                  }}
                                  disabled={deleteTranslation.isPending}
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
                        return (
                          <button
                            key={lng}
                            type="button"
                            className="db-r-lang-translate"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              startTranslation(report.id, lng);
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

                  {/* Action row — Export + Share + Delete. Export now
                      opens a modal (with format + language pickers)
                      instead of an inline dropdown; same UX as Share. */}
                  <div
                    className="db-r-actions"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canExport && (
                      <>
                        <button
                          className="db-r-btn"
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setExportTargetId(report.id);
                          }}
                          disabled={isBusyExporting}
                          title={t('dashboard.actions.export')}
                        >
                          <svg className="db-r-btn-ico" aria-hidden>
                            <use href="#i-dl" />
                          </svg>
                          {isBusyExporting ? '…' : t('dashboard.actions.export')}
                        </button>
                        <button
                          className="db-r-btn"
                          type="button"
                          onClick={(e) => handleShare(e, report.id)}
                          title={t('dashboard.actions.share')}
                        >
                          <svg className="db-r-btn-ico" aria-hidden>
                            <use href="#i-share" />
                          </svg>
                          {t('dashboard.actions.share')}
                        </button>
                      </>
                    )}
                    {/* Example card has no delete affordance — it's the
                        built-in demo and deletion would only be confusing.
                        The user can still wipe it manually via the API or
                        the assistant if they really need to. */}
                    {!isExample && (
                      <button
                        className="db-r-btn danger"
                        type="button"
                        onClick={(e) => handleDelete(e, report.id)}
                        title={t('dashboard.deleteTitle')}
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
      <ShareModal
        open={shareTargetId !== null}
        reportId={shareTargetId ?? ''}
        onClose={() => setShareTargetId(null)}
      />
      <ExportModal
        open={exportTargetId !== null}
        reportId={exportTargetId ?? ''}
        onClose={() => setExportTargetId(null)}
        onExport={(format, language) => {
          if (exportTargetId) {
            void handleExport(exportTargetId, format, language);
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
