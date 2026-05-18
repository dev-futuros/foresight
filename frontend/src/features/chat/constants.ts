/**
 * Static lookup tables and tunables shared across the chat feature.
 * Pulled out of ChatAssistant.tsx in Phase 3.
 */
import type { AssistantSnapshotInput } from '../../lib/buildAssistantSnapshot';
import type { EmpresaData } from '../report/steps/StepEmpresa';
import type { GlobalSteepData } from '../report/steps/StepGlobal';
import type { SteepData } from '../report/steps/StepSteep';
import type { HorizonData } from '../report/steps/StepHorizon';

/**
 * Maps a setField field id to the wizard step that owns it. Used by
 * AssistantCommands when a setField needs a pre-navigation goTo so the
 * user actually sees the field flash before its value is written.
 * Apply-all bypasses this — no ping-pong across steps.
 */
export const STEP_FOR_FIELD_ID: Record<string, number> = {
  'f-name': 1,
  'f-sector': 1,
  'f-size': 1,
  'f-horizon': 1,
  'f-market': 1,
  'f-challenge': 1,
  'f-strengths': 1,
  'f-consultant-name': 1,
  'f-consultant-company': 1,
  'gs-s': 2,
  'gs-t': 2,
  'gs-e': 2,
  'gs-env': 2,
  'gs-p': 2,
  'steep-s': 3,
  'steep-t': 3,
  'steep-e': 3,
  'steep-env': 3,
  'steep-p': 3,
  'hs-h1': 4,
  'hs-h2': 4,
  'hs-h3': 4,
};

/** setField field ids → translation key for the human-readable label. */
export const FIELD_NAME_KEY: Record<string, string> = {
  'f-name': 'chat.fields.f-name',
  'f-sector': 'chat.fields.f-sector',
  'f-size': 'chat.fields.f-size',
  'f-horizon': 'chat.fields.f-horizon',
  'f-market': 'chat.fields.f-market',
  'f-challenge': 'chat.fields.f-challenge',
  'f-strengths': 'chat.fields.f-strengths',
  'f-consultant-name': 'chat.fields.f-consultant-name',
  'f-consultant-company': 'chat.fields.f-consultant-company',
  'gs-s': 'chat.fields.gs-s',
  'gs-t': 'chat.fields.gs-t',
  'gs-e': 'chat.fields.gs-e',
  'gs-env': 'chat.fields.gs-env',
  'gs-p': 'chat.fields.gs-p',
  'steep-s': 'chat.fields.steep-s',
  'steep-t': 'chat.fields.steep-t',
  'steep-e': 'chat.fields.steep-e',
  'steep-env': 'chat.fields.steep-env',
  'steep-p': 'chat.fields.steep-p',
  'hs-h1': 'chat.fields.hs-h1',
  'hs-h2': 'chat.fields.hs-h2',
  'hs-h3': 'chat.fields.hs-h3',
};

/** Min character length at which a setField proposal gets a "Show more"
 *  toggle. Below this the preview fits within the line-clamp anyway. */
export const PREVIEW_TOGGLE_THRESHOLD = 120;

/** Delay between firing the pre-navigation goTo and resolving the chip.
 *  Long enough for the user to see the destination step flash. */
export const PRE_NAV_DELAY_MS = 280;

/**
 * Wizard context the assistant reads to compute state-aware chip
 * labels (e.g. goTo(step:2) reads "Generate Global STEEP" when the GS
 * fields are empty). Published by ChatAssistant's
 * AssistantContextProvider and consumed by MessageView / CommandChip.
 */
export interface PublishedWizardContext {
  currentStep?: number;
  empresa?: EmpresaData;
  globalSteep?: GlobalSteepData;
  steep?: SteepData;
  horizon?: HorizonData;
  /** Set by the report viewer (and the wizard's edit mode) so the
   *  assistant can resolve "this report" / "export this" without the
   *  user naming an id. */
  viewingReport?: AssistantSnapshotInput['viewingReport'];
  /** Set by the report viewer alongside viewingReport so the snapshot
   *  can surface the generated content. */
  reportResult?: AssistantSnapshotInput['reportResult'];
}
