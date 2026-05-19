import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { useCommands, type AnyCommandSpec } from '../../../lib/useCommands';
import { resetAssistant } from '../../../lib/assistantBridge';
import type { EmpresaData } from '../steps/StepEmpresa';
import type { GlobalSteepData } from '../steps/StepGlobal';
import type { SteepData } from '../steps/StepSteep';
import type { HorizonData } from '../steps/StepHorizon';
import type { SourceItem } from '../../../types/api';

/**
 * Empty defaults the {@code newReport} command resets to. Passed in by
 * the caller so the hook stays decoupled from the wizard's individual
 * step-data shape constructors (which live next to each step component).
 */
export interface WizardEmptyDefaults {
  empresa: EmpresaData;
  globalSteep: GlobalSteepData;
  steep: SteepData;
  horizon: HorizonData;
}

export interface UseWizardCommandsOptions {
  /** Current step (1-4). Read by wizardNext / wizardBack handlers. */
  step: number;
  /** True for /reports/:id/edit; tags runAnalysis enrichTrack as {@code mode: 'edit'}. */
  editMode: boolean;
  /** Existing report id when in edit mode. Used by {@code newReport} to redirect
   *  back to {@code /reports/new} when clearing while on an edit URL. */
  editingId?: string;

  // ── Cross-command handlers the page owns ─────────────────────────
  /** Move to a wizard step, flush autosave under the old step. */
  goToStep: (n: number) => void;
  /** Kick off the analyze pipeline; the runAnalysis handler delegates here. */
  handleSubmit: () => Promise<void>;
  /** Router navigation for the step-6 (results) handler. */
  navigate: NavigateFunction;

  // ── State slices read by enrichTrack ─────────────────────────────
  empresa: EmpresaData;
  globalData: GlobalSteepData;

  // ── Wizard state setters used by setField + newReport ───────────
  setEmpresa: Dispatch<SetStateAction<EmpresaData>>;
  setGlobalData: Dispatch<SetStateAction<GlobalSteepData>>;
  setSteep: Dispatch<SetStateAction<SteepData>>;
  setHorizon: Dispatch<SetStateAction<HorizonData>>;
  setGlobalSteepCitations: Dispatch<SetStateAction<SourceItem[]>>;
  setReportId: Dispatch<SetStateAction<string | null>>;
  setStep: Dispatch<SetStateAction<number>>;
  setMaxReached: Dispatch<SetStateAction<number>>;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  setGenerateError: Dispatch<SetStateAction<string | null>>;

  // ── Refs cleared by newReport ────────────────────────────────────
  reportIdRef: RefObject<string | null>;
  stepRef: RefObject<number>;
  globalSteepFetchedForRef: RefObject<string | null>;
  prefilledFor: RefObject<string | null>;
  userHasNavigatedRef: RefObject<boolean>;

  /** Empty defaults the newReport command resets the slices to. */
  emptyDefaults: WizardEmptyDefaults;
}

/**
 * Builds the command specs the wizard registers while mounted. Pure
 * function (modulo the setter calls inside handlers) — exported so
 * tests can drive the handlers directly without standing up a React
 * tree. {@link useWizardCommands} wraps this in {@code useCommands}
 * for the actual registration lifecycle.
 *
 * <p>Concern split: handlers MUTATE state via the supplied setters; they
 * don't read state directly. State that handlers need at dispatch time
 * (the current step, the current empresa for setField gold-flash) is
 * either passed in fresh (because the host re-runs this factory on
 * every render through useCommands) or read via a ref.
 */
export function buildWizardCommandSpecs(options: UseWizardCommandsOptions): AnyCommandSpec[] {
  const {
    step,
    editMode,
    editingId,
    goToStep,
    handleSubmit,
    navigate,
    empresa,
    globalData,
    setEmpresa,
    setGlobalData,
    setSteep,
    setHorizon,
    setGlobalSteepCitations,
    setReportId,
    setStep,
    setMaxReached,
    setIsGenerating,
    setGenerateError,
    reportIdRef,
    stepRef,
    globalSteepFetchedForRef,
    prefilledFor,
    userHasNavigatedRef,
    emptyDefaults,
  } = options;

  return [
    {
      name: 'setField',
      // Confirm-mode: the chat assistant emits the command inline as a
      // <command> tag, the renderer surfaces it as a pending chip the
      // user can click (or batch via Apply All), and only then does
      // this handler run.
      mode: 'confirm',
      // Track WHICH field the assistant filled + whether it added or
      // replaced. Bounded enums (the field id, 'add' | 'replace'). Never
      // list `value` — that's confidential client text.
      trackArgs: ['id', 'mode'],
      label: (args) => {
        const { id } = args as { id: string };
        return `Aplicar a ${id}`;
      },
      preview: (args) => {
        const { value } = args as { value: string };
        return value;
      },
      handler: (args) => {
        const { id, value, mode } = args as {
          id: string;
          value: string;
          mode: 'add' | 'replace';
        };
        const apply = (cur: string) =>
          mode === 'replace' ? value : cur ? `${cur}\n\n${value}` : value;
        switch (id) {
          case 'f-name':
            setEmpresa((p) => ({ ...p, name: value }));
            break;
          case 'f-sector':
            setEmpresa((p) => ({ ...p, sector: value }));
            break;
          case 'f-size':
            setEmpresa((p) => ({ ...p, size: value }));
            break;
          case 'f-horizon':
            setEmpresa((p) => ({ ...p, horizon: value }));
            break;
          case 'f-market':
            setEmpresa((p) => ({ ...p, market: value }));
            break;
          case 'f-challenge':
            setEmpresa((p) => ({ ...p, challenge: apply(p.challenge) }));
            break;
          case 'f-strengths':
            setEmpresa((p) => ({ ...p, strengths: apply(p.strengths) }));
            break;
          case 'f-consultant-name':
            setEmpresa((p) => ({ ...p, consultantName: value }));
            break;
          case 'f-consultant-company':
            setEmpresa((p) => ({ ...p, consultantCompany: value }));
            break;
          case 'gs-s':
            setGlobalData((p) => ({ ...p, S: apply(p.S) }));
            break;
          case 'gs-t':
            setGlobalData((p) => ({ ...p, T: apply(p.T) }));
            break;
          case 'gs-e':
            setGlobalData((p) => ({ ...p, E: apply(p.E) }));
            break;
          case 'gs-env':
            setGlobalData((p) => ({ ...p, ENV: apply(p.ENV) }));
            break;
          case 'gs-p':
            setGlobalData((p) => ({ ...p, P: apply(p.P) }));
            break;
          case 'steep-s':
            setSteep((p) => ({ ...p, social: apply(p.social) }));
            break;
          case 'steep-t':
            setSteep((p) => ({ ...p, technological: apply(p.technological) }));
            break;
          case 'steep-e':
            setSteep((p) => ({ ...p, economic: apply(p.economic) }));
            break;
          case 'steep-env':
            setSteep((p) => ({ ...p, environmental: apply(p.environmental) }));
            break;
          case 'steep-p':
            setSteep((p) => ({ ...p, political: apply(p.political) }));
            break;
          case 'hs-h1':
            setHorizon((p) => ({ ...p, H1: apply(p.H1) }));
            break;
          case 'hs-h2':
            setHorizon((p) => ({ ...p, H2: apply(p.H2) }));
            break;
          case 'hs-h3':
            setHorizon((p) => ({ ...p, H3: apply(p.H3) }));
            break;
          default:
            throw new Error(`Unknown field id: ${id}`);
        }
        // Brief gold flash on the field so the user sees WHERE the
        // value landed. Deferred to the next macrotask so React commits
        // the new value first; otherwise the flash starts before the
        // textarea/input visibly updates. The field's DOM id matches
        // the setField target id by design — see the id attributes on
        // each wizard step's inputs.
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.add('fs-suggest-flash');
            window.setTimeout(() => el.classList.remove('fs-suggest-flash'), 1500);
          }, 0);
        }
        return `Applied to ${id}.`;
      },
    },

    {
      name: 'runAnalysis',
      mode: 'confirm',
      label: () => 'Lanzar análisis de foresight',
      // Rich props come from closure state at dispatch time — args
      // are always empty since the model doesn't carry wizard state.
      // The bus auto-fires 'Command Dispatched, command=runAnalysis'
      // with these attached; no ad-hoc track() inside handleSubmit.
      enrichTrack: () => ({
        mode: editMode ? 'edit' : 'new',
        horizon: empresa.horizon,
        hasGlobalSteep: Boolean(
          globalData.S.trim() ||
            globalData.T.trim() ||
            globalData.E.trim() ||
            globalData.ENV.trim() ||
            globalData.P.trim(),
        ),
      }),
      handler: async () => {
        await handleSubmit();
        return 'Analysis launched.';
      },
    },

    // generateGlobalSteep is registered by StepGlobal itself — only that
    // component has the imperative fetchAll() handle and the fetchedFor
    // ref needed to force a re-run when the sector hasn't changed.

    // Override the shell's `goTo` while the wizard is mounted. The
    // shell version uses navigate('/reports/new?step=N'), which doesn't
    // re-render NewReportPage when it's already mounted (initialStep
    // is read once on mount). Calling goToStep directly is the only
    // way to actually change the visible step.
    {
      name: 'goTo',
      mode: 'auto',
      trackArgs: ['step'],
      handler: (args) => {
        const { step: target } = args as { step: number };
        if (target === 5) {
          throw new Error(
            'Step 5 is the analysis loader, not a navigable step. To start the analysis emit runAnalysis instead.',
          );
        }
        if (target === 6) {
          // Step 6 lives outside the wizard. If a report is already
          // saved and analysed, jump to its viewer; otherwise the
          // request is a no-op (the user has to generate first).
          const id = reportIdRef.current;
          if (id) {
            navigate(`/reports/${id}`);
            return `Opened the generated report.`;
          }
          throw new Error(
            'No analysed report yet. The user has to run the analysis (step 4 → Generate) before the results page exists.',
          );
        }
        if (target >= 1 && target <= 4) {
          goToStep(target);
          return `Moved to step ${target}.`;
        }
        throw new Error(`Step ${target} is out of range (1-6).`);
      },
    },

    // Convenience wrappers around goTo: bump or rewind by one wizard
    // page. Clamp to [1, 4] so the assistant can't fall off either end
    // and so step 5 (the loader) stays unreachable through nav.
    {
      name: 'wizardNext',
      mode: 'auto',
      handler: () => {
        if (step >= 4) {
          throw new Error(
            'Already at the last input step. To start the analysis emit runAnalysis.',
          );
        }
        goToStep(step + 1);
        return `Moved to step ${step + 1}.`;
      },
    },

    {
      name: 'wizardBack',
      mode: 'auto',
      handler: () => {
        if (step <= 1) {
          throw new Error('Already at the first wizard step.');
        }
        goToStep(step - 1);
        return `Moved to step ${step - 1}.`;
      },
    },

    // Page-scoped newReport override. The shell-level version just
    // calls navigate('/reports/new') — fine if the user is on a
    // different route, but a no-op when they're already on the wizard
    // (same URL → no remount, state survives). This version clears
    // every wizard slice imperatively so "new report" actually starts
    // from a blank form even when the user is mid-flow.
    {
      name: 'newReport',
      mode: 'auto',
      handler: () => {
        setEmpresa(emptyDefaults.empresa);
        setGlobalData(emptyDefaults.globalSteep);
        setSteep(emptyDefaults.steep);
        setHorizon(emptyDefaults.horizon);
        setGlobalSteepCitations([]);
        setReportId(null);
        reportIdRef.current = null;
        setStep(1);
        stepRef.current = 1;
        setMaxReached(1);
        setIsGenerating(false);
        setGenerateError(null);
        // Reset the wizard-session refs so guards behave as if this is
        // a fresh mount: another sector won't be confused with the
        // cleared one for auto-fetch purposes, and prefill won't
        // reapply if the user navigates back into edit mode later.
        globalSteepFetchedForRef.current = null;
        prefilledFor.current = null;
        userHasNavigatedRef.current = false;
        // If the user was on /reports/:id/edit, kick them to
        // /reports/new so the URL matches the cleared state. No-op
        // when already there.
        if (editingId) navigate('/reports/new');
        // Wipe the chat conversation too — the prior brief, scenarios,
        // and Q&A are about a different report and would confuse the
        // assistant's "what's the user looking at?" model on the next
        // turn. The chat re-registers the resetter on mount via the
        // bridge.
        resetAssistant();
        return 'Cleared the form and started a fresh report.';
      },
    },
  ];
}

/**
 * Registers the wizard's 6 commands with the bus for the lifetime of
 * the calling component. Thin wrapper around {@link useCommands} that
 * delegates the spec-building to {@link buildWizardCommandSpecs} so the
 * specs can be exercised in tests without standing up a React tree.
 *
 * <p>Shell-level commands (goTo, newReport) registered earlier by
 * AssistantCommands are automatically restored on unmount via
 * useCommands' previous-binding snapshot.
 */
export function useWizardCommands(options: UseWizardCommandsOptions): void {
  useCommands(() => buildWizardCommandSpecs(options));
}
