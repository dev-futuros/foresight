import { useEffect, useRef } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { register, unregister, type CommandSpec } from '../../lib/commandBus';
import { useDeleteReport } from '../../hooks/useReports';
import api from '../../lib/api';

/**
 * Default navigation-only `goTo` handler. NewReportPage overrides this with a
 * version that calls goToStep imperatively while the wizard is mounted; on
 * unmount it re-registers this version so the assistant keeps a working
 * `goTo` for users on other routes.
 */
export function buildShellGoToCommand(
  navigate: NavigateFunction,
): CommandSpec<{ step: number }, string> {
  return {
    name: 'goTo',
    mode: 'auto',
    handler: ({ step }) => {
      if (step === 5) {
        throw new Error(
          "Step 5 is the analysis loader, not a navigable step. To start the analysis emit runAnalysis instead.",
        );
      }
      if (step === 6) {
        // Step 6 is "results"; if there's no current report, fall back to
        // the dashboard so the user can pick one.
        navigate('/dashboard');
        return 'Opened dashboard (no active report to land on step 6).';
      }
      navigate(`/reports/new?step=${step}`);
      return `Navigated to step ${step}.`;
    },
  };
}

/**
 * Mounts the always-available assistant commands: navigation, language
 * switching, generic report management, share/export passthrough.
 *
 * Lives inside {@link AppShell} so it has access to the router and the
 * shared QueryClient. Wizard-specific commands ({@code setField},
 * {@code runAnalysis}, {@code generateGlobalSteep}, {@code loadExample})
 * register from {@code NewReportPage} where the underlying state lives.
 */
export default function AssistantCommands() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const qc = useQueryClient();
  const deleteReport = useDeleteReport();

  // Mirror everything we close over into refs. The bus must be wired exactly
  // once per mount; otherwise this effect's cleanup wipes commands that
  // page-scoped components (NewReportPage's wizard `goTo`) registered on top
  // of ours, and the body re-installs the shell version — which is the bug
  // we just chased: the URL changed via navigate(?step=N) but the wizard's
  // local step state never updated. `deleteReport` from useDeleteReport()
  // and other react-query mutations have unstable identity per render, so
  // depending on them directly forces this effect to re-run; refs fix that.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const i18nRef = useRef(i18n);
  i18nRef.current = i18n;
  const qcRef = useRef<QueryClient>(qc);
  qcRef.current = qc;
  const deleteReportAsyncRef = useRef(deleteReport.mutateAsync);
  deleteReportAsyncRef.current = deleteReport.mutateAsync;

  useEffect(() => {
    // Navigation — every step except 5 (transient analysis loader). Routes
    // to the wizard with ?step=N when the user isn't already there.
    register(buildShellGoToCommand(navigateRef.current));

    register<Record<string, never>, string>({
      name: 'openDashboard',
      mode: 'auto',
      handler: () => {
        navigateRef.current('/dashboard');
        return 'Dashboard opened.';
      },
    });

    register<Record<string, never>, string>({
      name: 'closeDashboard',
      mode: 'auto',
      handler: () => {
        navigateRef.current('/reports/new');
        return 'Returned to the wizard.';
      },
    });

    register<Record<string, never>, string>({
      name: 'newReport',
      mode: 'auto',
      handler: () => {
        navigateRef.current('/reports/new');
        return 'Started a new blank report.';
      },
    });

    register<{ lang: 'es' | 'en' }, string>({
      name: 'setLang',
      mode: 'auto',
      handler: async ({ lang }) => {
        await i18nRef.current.changeLanguage(lang);
        return `Language changed to ${lang}.`;
      },
    });

    register<{ id: string }, string>({
      name: 'loadReport',
      mode: 'auto',
      handler: ({ id }) => {
        navigateRef.current(`/reports/${id}`);
        return `Loaded report ${id}.`;
      },
    });

    register<{ id: string }, string>({
      name: 'deleteReport',
      mode: 'confirm',
      label: () => 'Borrar informe',
      handler: async ({ id }) => {
        await deleteReportAsyncRef.current(id);
        return `Report ${id} deleted.`;
      },
    });

    register<{ id?: string }, string>({
      name: 'shareReport',
      mode: 'confirm',
      label: () => 'Compartir informe',
      handler: async ({ id }) => {
        // The actual share modal is wired to the report-page button; the
        // assistant flow simply mints a share token by hitting the same
        // backend endpoint and reports the URL back to the model.
        if (!id) {
          throw new Error(
            'No report id provided. Ask the user which saved report to share, or open a report first.',
          );
        }
        const res = await api.post<{ shareUrl: string; expiresAt: string }>(
          `/reports/${id}/share`,
        );
        // Invalidate any cached lists so dashboards refresh next time.
        void qcRef.current.invalidateQueries({ queryKey: ['reports'] });
        return `Share link: ${res.data.shareUrl} (expires ${res.data.expiresAt}).`;
      },
    });

    register<{ id?: string }, string>({
      name: 'exportPDF',
      mode: 'confirm',
      label: () => 'Exportar PDF',
      handler: async ({ id }) => {
        if (!id) {
          throw new Error('Open a report first; export needs a target report id.');
        }
        navigateRef.current(`/reports/${id}?export=pdf`);
        return 'Opened the report; the user can now click PDF.';
      },
    });

    register<{ id?: string }, string>({
      name: 'exportPPT',
      mode: 'confirm',
      label: () => 'Exportar PowerPoint',
      handler: async ({ id }) => {
        if (!id) {
          throw new Error('Open a report first; export needs a target report id.');
        }
        navigateRef.current(`/reports/${id}?export=ppt`);
        return 'Opened the report; the user can now click PPT.';
      },
    });

    return () => {
      [
        'goTo',
        'openDashboard',
        'closeDashboard',
        'newReport',
        'setLang',
        'loadReport',
        'deleteReport',
        'shareReport',
        'exportPDF',
        'exportPPT',
      ].forEach(unregister);
    };
    // Empty deps: the bus must be wired exactly once. Handlers close over
    // refs that are kept fresh by the assignments above, so we don't lose
    // up-to-date values by skipping deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
