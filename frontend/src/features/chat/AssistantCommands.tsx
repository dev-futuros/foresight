import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { type CommandSpec } from '../../lib/commandBus';
import { useCommands } from '../../lib/useCommands';
import { useDeleteReport } from '../../hooks/useReports';
import { useLogout } from '../../hooks/useAuth';
import api from '../../lib/api';

/**
 * Default navigation-only `goTo` handler. NewReportPage overrides this with a
 * version that calls goToStep imperatively while the wizard is mounted; on
 * unmount {@link useCommands} restores this version automatically.
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
 * Mounts the always-available assistant commands. These cover navigation,
 * language, generic report management (load/edit/delete), share/export
 * passthrough, refresh, and logout.
 *
 * Lives inside {@link AppShell} so it has access to the router, the shared
 * QueryClient and Clerk's signOut. Page-scoped commands live where their
 * state lives — wizard input mutations in {@code NewReportPage}, the global
 * STEEP regen in {@code StepGlobal}, etc. — and rely on
 * {@link useCommands}'s automatic restore-on-unmount to put these shell
 * defaults back when the user navigates away.
 */
export default function AssistantCommands() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const qc = useQueryClient();
  const deleteReport = useDeleteReport();
  const logout = useLogout();

  useCommands(() => [
    buildShellGoToCommand(navigate),

    {
      name: 'openDashboard',
      mode: 'auto',
      handler: () => {
        navigate('/dashboard');
        return 'Dashboard opened.';
      },
    },

    {
      name: 'closeDashboard',
      mode: 'auto',
      handler: () => {
        navigate('/reports/new');
        return 'Returned to the wizard.';
      },
    },

    {
      name: 'newReport',
      mode: 'auto',
      handler: () => {
        navigate('/reports/new');
        return 'Started a new blank report.';
      },
    },

    {
      name: 'setLang',
      mode: 'auto',
      handler: async (args) => {
        const { lang } = args as { lang: 'es' | 'en' };
        await i18n.changeLanguage(lang);
        return `Language changed to ${lang}.`;
      },
    },

    {
      name: 'loadReport',
      mode: 'auto',
      handler: (args) => {
        const { id } = args as { id: string };
        navigate(`/reports/${id}`);
        return `Loaded report ${id}.`;
      },
    },

    // Open a report (typically a draft) in wizard edit mode. `loadReport`
    // always lands on the read-only viewer; this lands on the wizard so the
    // user can tweak inputs and regenerate.
    {
      name: 'editReport',
      mode: 'auto',
      handler: (args) => {
        const { id } = args as { id: string };
        navigate(`/reports/${id}/edit`);
        return `Opened report ${id} for editing.`;
      },
    },

    {
      name: 'deleteReport',
      mode: 'confirm',
      label: () => 'Borrar informe',
      handler: async (args) => {
        const { id } = args as { id: string };
        await deleteReport.mutateAsync(id);
        return `Report ${id} deleted.`;
      },
    },

    {
      name: 'shareReport',
      mode: 'confirm',
      label: () => 'Compartir informe',
      handler: async (args) => {
        const { id } = args as { id?: string };
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
        void qc.invalidateQueries({ queryKey: ['reports'] });
        return `Share link: ${res.data.shareUrl} (expires ${res.data.expiresAt}).`;
      },
    },

    // Phase 2 will replace the navigate-to-report passthrough with a
    // page-scoped override that actually fires the export. For now this is
    // the same fallback the previous registration used.
    {
      name: 'exportPDF',
      mode: 'confirm',
      label: () => 'Exportar PDF',
      handler: (args) => {
        const { id } = args as { id?: string };
        if (!id) {
          throw new Error('Open a report first; export needs a target report id.');
        }
        navigate(`/reports/${id}?export=pdf`);
        return 'Opened the report; the user can now click PDF.';
      },
    },

    {
      name: 'exportPPT',
      mode: 'confirm',
      label: () => 'Exportar PowerPoint',
      handler: (args) => {
        const { id } = args as { id?: string };
        if (!id) {
          throw new Error('Open a report first; export needs a target report id.');
        }
        navigate(`/reports/${id}?export=ppt`);
        return 'Opened the report; the user can now click PPT.';
      },
    },

    // Force the dashboard / report queries to refetch. Useful when the user
    // suspects the cache is stale ("did my new report show up?") or after an
    // out-of-band mutation we don't have a hook for.
    {
      name: 'refreshReports',
      mode: 'auto',
      handler: async () => {
        await qc.invalidateQueries({ queryKey: ['reports'] });
        return 'Refreshed the reports list.';
      },
    },

    // End the Clerk session and bounce to /sign-in. Confirm-mode because it
    // unambiguously destroys the current working session — the assistant
    // shouldn't be able to log a user out as a side-effect of a misread.
    {
      name: 'logout',
      mode: 'confirm',
      label: () => 'Cerrar sesión',
      handler: () => {
        logout();
        return 'Signing out…';
      },
    },
  ]);

  return null;
}
