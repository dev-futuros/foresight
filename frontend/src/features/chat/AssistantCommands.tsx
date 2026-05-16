import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { type CommandSpec } from '../../lib/commandBus';
import { useCommands } from '../../lib/useCommands';
import { useDeleteReport } from '../../hooks/useReports';
import { useLogout } from '../../hooks/useAuth';
import { resetAssistant } from '../../lib/assistantBridge';
import api from '../../lib/api';

/**
 * Resolve the target report id for share/export commands. Prefers an
 * explicit {@code id} arg from the assistant; falls back to parsing the
 * current URL ({@code /reports/:id} or {@code /reports/:id/edit}) so the
 * model doesn't need to pass an id when the user is already viewing a
 * report. Returns {@code id: undefined} when neither source has one,
 * letting the caller surface a clear error.
 *
 * <p>Reading {@code window.location.pathname} here (rather than threading
 * the router's location through the command spec) keeps the registration
 * static — the spec doesn't need to re-register on every route change.
 */
function resolveReportIdFromArgsOrUrl(args: unknown): { id: string | undefined } {
  const fromArgs = (args as { id?: unknown } | undefined)?.id;
  if (typeof fromArgs === 'string' && fromArgs.length > 0) {
    return { id: fromArgs };
  }
  if (typeof window === 'undefined') return { id: undefined };
  const m = window.location.pathname.match(/^\/reports\/([^/?#]+)(?:\/edit)?\/?$/);
  if (m && m[1] !== 'new') return { id: m[1] };
  return { id: undefined };
}

/**
 * Default navigation-only `goTo` handler. NewReportPage overrides this with a
 * version that calls goToStep imperatively while the wizard is mounted; on
 * unmount {@link useCommands} restores this version automatically.
 */
function buildShellGoToCommand(navigate: NavigateFunction): CommandSpec<{ step: number }, string> {
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
      // Auto-mode — the model is prompted to ask the user verbally before
      // emitting when an in-progress wizard or open report would be lost.
      name: 'newReport',
      mode: 'auto',
      handler: () => {
        navigate('/reports/new');
        // Wipe the chat too — the previous brief / scenarios / Q&A
        // aren't relevant to the new blank report. NewReportPage's
        // page-scoped override does the same; this shell-level path
        // covers the case where the user kicks off a new report from a
        // non-wizard route (dashboard, account, share view).
        resetAssistant();
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

    // Auto-mode — the model asks verbally before switching reports when an
    // in-progress wizard or different open report would be lost.
    {
      name: 'loadReport',
      mode: 'auto',
      handler: (args) => {
        const { id } = args as { id: string };
        navigate(`/reports/${id}`);
        // Reset the chat's API context — the previous brief's Q&A is
        // about a different report and would confuse the assistant on
        // subsequent turns. Visible message history stays on screen.
        resetAssistant();
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
        // Same context-reset rationale as loadReport.
        resetAssistant();
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

    // Shell-level share/export fallbacks — used when the user is NOT on a
    // report viewer (dashboard, account page, etc.) and the model emits
    // these commands. ReportPage registers page-scoped overrides that
    // know the currently-open report from the URL, so when the user IS
    // viewing a report the chip just opens the matching modal.
    {
      name: 'shareReport',
      mode: 'auto',
      handler: async (args) => {
        const { id } = resolveReportIdFromArgsOrUrl(args);
        if (!id) {
          throw new Error(
            'No report is open. Ask the user which saved report to share, or open one first.',
          );
        }
        const res = await api.post<{ shareUrl: string; expiresAt: string }>(
          `/reports/${id}/share`,
        );
        void qc.invalidateQueries({ queryKey: ['reports'] });
        return `Share link: ${res.data.shareUrl} (expires ${res.data.expiresAt}).`;
      },
    },

    // Single export command — always surfaces the export dialog. The
    // assistant doesn't need to (and shouldn't) reason about formats or
    // languages itself; the user picks both in the modal. ReportPage
    // registers a page-scoped override that opens the dialog directly
    // when the user is on a report viewer; this shell fallback navigates
    // first when the user is on the dashboard / elsewhere.
    {
      name: 'exportReport',
      mode: 'auto',
      handler: (args) => {
        const { id } = resolveReportIdFromArgsOrUrl(args);
        if (!id) {
          throw new Error(
            'No report is open. Open the report you want to export, then ask again.',
          );
        }
        navigate(`/reports/${id}?export=1`);
        return 'Opening the report viewer — the export dialog will surface there.';
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
