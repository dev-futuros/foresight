import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildWizardCommandSpecs,
  type UseWizardCommandsOptions,
} from '../features/report/hooks/useWizardCommands';
import type { EmpresaData } from '../features/report/steps/StepEmpresa';
import type { GlobalSteepData } from '../features/report/steps/StepGlobal';
import type { SteepData } from '../features/report/steps/StepSteep';
import type { HorizonData } from '../features/report/steps/StepHorizon';
import type { AnyCommandSpec } from '../lib/useCommands';

// The newReport command calls resetAssistant() to clear the chat. Mock
// it so tests don't need the assistantBridge / Sentry stack.
const resetAssistantMock = vi.fn();
vi.mock('../lib/assistantBridge', () => ({
  resetAssistant: () => resetAssistantMock(),
  // Other exports the production module ships — the page imports them
  // elsewhere but the hook only uses resetAssistant. Stubs keep the
  // module evaluation green.
  notifyAssistant: vi.fn(),
  setAssistantNotifier: vi.fn(),
  setAssistantResetter: vi.fn(),
}));

const EMPTY_EMPRESA: EmpresaData = {
  name: '',
  sector: '',
  size: '',
  horizon: '',
  market: '',
  challenge: '',
  strengths: '',
  consultantName: '',
  consultantCompany: '',
  title: '',
};
const EMPTY_GLOBAL_STEEP: GlobalSteepData = { S: '', T: '', E: '', ENV: '', P: '' };
const EMPTY_STEEP: SteepData = {
  social: '',
  technological: '',
  economic: '',
  environmental: '',
  political: '',
};
const EMPTY_HORIZON: HorizonData = { H1: '', H2: '', H3: '' };

function setup(overrides: Partial<UseWizardCommandsOptions> = {}) {
  const setEmpresa = vi.fn();
  const setGlobalData = vi.fn();
  const setSteep = vi.fn();
  const setHorizon = vi.fn();
  const setGlobalSteepCitations = vi.fn();
  const setReportId = vi.fn();
  const setStep = vi.fn();
  const setMaxReached = vi.fn();
  const setIsGenerating = vi.fn();
  const setGenerateError = vi.fn();
  const navigate = vi.fn();
  const goToStep = vi.fn();
  const handleSubmit = vi.fn().mockResolvedValue(undefined);

  const reportIdRef = { current: null as string | null };
  const stepRef = { current: 1 };
  const globalSteepFetchedForRef = { current: 'tech' as string | null };
  const prefilledFor = { current: 'r-1' as string | null };
  const userHasNavigatedRef = { current: true };

  const options: UseWizardCommandsOptions = {
    step: 2,
    editMode: false,
    goToStep,
    handleSubmit,
    navigate,
    empresa: { ...EMPTY_EMPRESA, horizon: '2026' },
    globalData: { ...EMPTY_GLOBAL_STEEP, S: 'rising population' },
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
    emptyDefaults: {
      empresa: EMPTY_EMPRESA,
      globalSteep: EMPTY_GLOBAL_STEEP,
      steep: EMPTY_STEEP,
      horizon: EMPTY_HORIZON,
    },
    ...overrides,
  };

  const specs = buildWizardCommandSpecs(options);
  const byName = (name: string): AnyCommandSpec => {
    const found = specs.find((s) => s.name === name);
    if (!found) throw new Error(`spec ${name} not built`);
    return found;
  };

  return {
    specs,
    byName,
    options,
    mocks: {
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
      navigate,
      goToStep,
      handleSubmit,
      reportIdRef,
      stepRef,
      globalSteepFetchedForRef,
      prefilledFor,
      userHasNavigatedRef,
    },
  };
}

beforeEach(() => {
  resetAssistantMock.mockReset();
});

describe('buildWizardCommandSpecs — registry', () => {
  it('builds exactly the six wizard commands', () => {
    const { specs } = setup();
    expect(specs.map((s) => s.name)).toEqual([
      'setField',
      'runAnalysis',
      'goTo',
      'wizardNext',
      'wizardBack',
      'newReport',
    ]);
  });
});

describe('setField — single-value fields (replace semantics)', () => {
  it('updates empresa.name when id is f-name', () => {
    const { byName, mocks } = setup();
    byName('setField').handler({ id: 'f-name', value: 'Acme', mode: 'replace' });
    expect(mocks.setEmpresa).toHaveBeenCalledTimes(1);
    const updater = mocks.setEmpresa.mock.calls[0][0] as (p: EmpresaData) => EmpresaData;
    expect(updater(EMPTY_EMPRESA)).toEqual({ ...EMPTY_EMPRESA, name: 'Acme' });
  });

  it('updates empresa.sector when id is f-sector', () => {
    const { byName, mocks } = setup();
    byName('setField').handler({ id: 'f-sector', value: 'fintech', mode: 'replace' });
    const updater = mocks.setEmpresa.mock.calls[0][0] as (p: EmpresaData) => EmpresaData;
    expect(updater(EMPTY_EMPRESA).sector).toBe('fintech');
  });

  it('updates globalData.S when id is gs-s', () => {
    const { byName, mocks } = setup();
    byName('setField').handler({ id: 'gs-s', value: 'demographic shift', mode: 'replace' });
    const updater = mocks.setGlobalData.mock.calls[0][0] as (p: GlobalSteepData) => GlobalSteepData;
    expect(updater(EMPTY_GLOBAL_STEEP).S).toBe('demographic shift');
  });

  it('updates steep.social when id is steep-s', () => {
    const { byName, mocks } = setup();
    byName('setField').handler({ id: 'steep-s', value: 'aging workforce', mode: 'replace' });
    const updater = mocks.setSteep.mock.calls[0][0] as (p: SteepData) => SteepData;
    expect(updater(EMPTY_STEEP).social).toBe('aging workforce');
  });

  it('updates horizon.H1 when id is hs-h1', () => {
    const { byName, mocks } = setup();
    byName('setField').handler({ id: 'hs-h1', value: 'rev growth', mode: 'replace' });
    const updater = mocks.setHorizon.mock.calls[0][0] as (p: HorizonData) => HorizonData;
    expect(updater(EMPTY_HORIZON).H1).toBe('rev growth');
  });

  it('throws on an unknown field id', () => {
    const { byName } = setup();
    expect(() =>
      byName('setField').handler({ id: 'bogus', value: 'x', mode: 'replace' }),
    ).toThrow(/Unknown field id: bogus/);
  });
});

describe('setField — appendable fields (add semantics)', () => {
  it('appends to an existing challenge with two newlines as separator', () => {
    const { byName, mocks } = setup();
    byName('setField').handler({
      id: 'f-challenge',
      value: 'new line',
      mode: 'add',
    });
    const updater = mocks.setEmpresa.mock.calls[0][0] as (p: EmpresaData) => EmpresaData;
    expect(updater({ ...EMPTY_EMPRESA, challenge: 'old line' }).challenge).toBe(
      'old line\n\nnew line',
    );
  });

  it('uses just the new value when the prior field is empty (no leading newlines)', () => {
    const { byName, mocks } = setup();
    byName('setField').handler({
      id: 'f-strengths',
      value: 'first',
      mode: 'add',
    });
    const updater = mocks.setEmpresa.mock.calls[0][0] as (p: EmpresaData) => EmpresaData;
    expect(updater(EMPTY_EMPRESA).strengths).toBe('first');
  });

  it('replace mode ignores existing content even on an appendable field', () => {
    const { byName, mocks } = setup();
    byName('setField').handler({
      id: 'gs-s',
      value: 'fresh',
      mode: 'replace',
    });
    const updater = mocks.setGlobalData.mock.calls[0][0] as (p: GlobalSteepData) => GlobalSteepData;
    expect(updater({ ...EMPTY_GLOBAL_STEEP, S: 'old' }).S).toBe('fresh');
  });
});

describe('goTo handler', () => {
  it('throws when target is step 5 (the analysis loader)', () => {
    const { byName } = setup();
    expect(() => byName('goTo').handler({ step: 5 })).toThrow(/Step 5 is the analysis loader/);
  });

  it('throws when target is step 6 and no report has been generated yet', () => {
    const { byName, mocks } = setup();
    mocks.reportIdRef.current = null;
    expect(() => byName('goTo').handler({ step: 6 })).toThrow(/No analysed report yet/);
  });

  it('navigates to /reports/:id when target is step 6 and a reportId exists', () => {
    const { byName, mocks } = setup();
    mocks.reportIdRef.current = 'r-42';
    const result = byName('goTo').handler({ step: 6 });
    expect(mocks.navigate).toHaveBeenCalledWith('/reports/r-42');
    expect(result).toBe('Opened the generated report.');
  });

  it('calls goToStep for valid targets 1-4', () => {
    const { byName, mocks } = setup();
    byName('goTo').handler({ step: 3 });
    expect(mocks.goToStep).toHaveBeenCalledWith(3);
  });

  it('throws for out-of-range targets', () => {
    const { byName } = setup();
    expect(() => byName('goTo').handler({ step: 0 })).toThrow(/out of range/);
    expect(() => byName('goTo').handler({ step: 7 })).toThrow(/out of range/);
  });
});

describe('wizardNext / wizardBack handlers', () => {
  it('wizardNext throws when already at step 4', () => {
    const { byName } = setup({ step: 4 });
    expect(() => byName('wizardNext').handler({})).toThrow(/Already at the last input step/);
  });

  it('wizardNext bumps the step by one in the [1,4] range', () => {
    const { byName, mocks } = setup({ step: 2 });
    byName('wizardNext').handler({});
    expect(mocks.goToStep).toHaveBeenCalledWith(3);
  });

  it('wizardBack throws when already at step 1', () => {
    const { byName } = setup({ step: 1 });
    expect(() => byName('wizardBack').handler({})).toThrow(/first wizard step/);
  });

  it('wizardBack rewinds the step by one', () => {
    const { byName, mocks } = setup({ step: 3 });
    byName('wizardBack').handler({});
    expect(mocks.goToStep).toHaveBeenCalledWith(2);
  });
});

describe('runAnalysis handler', () => {
  it('delegates to handleSubmit', async () => {
    const { byName, mocks } = setup();
    await byName('runAnalysis').handler({});
    expect(mocks.handleSubmit).toHaveBeenCalledTimes(1);
  });

  it('enrichTrack reports mode=new when editMode is false', () => {
    const { byName } = setup({ editMode: false });
    const out = byName('runAnalysis').enrichTrack?.({}, 'ok');
    expect(out?.mode).toBe('new');
  });

  it('enrichTrack reports mode=edit when editMode is true', () => {
    const { byName } = setup({ editMode: true });
    const out = byName('runAnalysis').enrichTrack?.({}, 'ok');
    expect(out?.mode).toBe('edit');
  });

  it('enrichTrack flags hasGlobalSteep when any of the five dimensions has content', () => {
    const { byName } = setup({
      globalData: { S: 'present', T: '', E: '', ENV: '', P: '' },
    });
    const out = byName('runAnalysis').enrichTrack?.({}, 'ok');
    expect(out?.hasGlobalSteep).toBe(true);
  });

  it('enrichTrack flags hasGlobalSteep false when every dimension is whitespace-only', () => {
    const { byName } = setup({
      globalData: { S: '   ', T: '', E: '', ENV: '', P: '' },
    });
    const out = byName('runAnalysis').enrichTrack?.({}, 'ok');
    expect(out?.hasGlobalSteep).toBe(false);
  });
});

describe('newReport handler', () => {
  it('clears every wizard slice + every wizard-session ref', () => {
    const { byName, mocks } = setup();
    mocks.reportIdRef.current = 'r-5';
    mocks.stepRef.current = 3;
    byName('newReport').handler({});

    expect(mocks.setEmpresa).toHaveBeenCalledWith(EMPTY_EMPRESA);
    expect(mocks.setGlobalData).toHaveBeenCalledWith(EMPTY_GLOBAL_STEEP);
    expect(mocks.setSteep).toHaveBeenCalledWith(EMPTY_STEEP);
    expect(mocks.setHorizon).toHaveBeenCalledWith(EMPTY_HORIZON);
    expect(mocks.setGlobalSteepCitations).toHaveBeenCalledWith([]);
    expect(mocks.setReportId).toHaveBeenCalledWith(null);
    expect(mocks.reportIdRef.current).toBeNull();
    expect(mocks.setStep).toHaveBeenCalledWith(1);
    expect(mocks.stepRef.current).toBe(1);
    expect(mocks.setMaxReached).toHaveBeenCalledWith(1);
    expect(mocks.setIsGenerating).toHaveBeenCalledWith(false);
    expect(mocks.setGenerateError).toHaveBeenCalledWith(null);
    expect(mocks.globalSteepFetchedForRef.current).toBeNull();
    expect(mocks.prefilledFor.current).toBeNull();
    expect(mocks.userHasNavigatedRef.current).toBe(false);
  });

  it('redirects to /reports/new when called from an edit URL', () => {
    const { byName, mocks } = setup({ editingId: 'r-9' });
    byName('newReport').handler({});
    expect(mocks.navigate).toHaveBeenCalledWith('/reports/new');
  });

  it("does NOT redirect when not on an edit URL (editingId undefined)", () => {
    const { byName, mocks } = setup({ editingId: undefined });
    byName('newReport').handler({});
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('resets the chat assistant via the bridge', () => {
    const { byName } = setup();
    byName('newReport').handler({});
    expect(resetAssistantMock).toHaveBeenCalledTimes(1);
  });
});
