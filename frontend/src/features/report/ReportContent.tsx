import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Backcasting,
  GlobalSteep,
  KeyUncertainty,
  Scenario,
  ScenarioPlanning,
  Sources,
  StrategicMap,
  WeakSignal,
  Wildcard,
} from '../../lib/aiClient';
import TabSummary from './tabs/TabSummary';
import TabScenarios from './tabs/TabScenarios';
import TabScenarioPlanning from './tabs/TabScenarioPlanning';
import TabBackcasting from './tabs/TabBackcasting';
import TabSignals from './tabs/TabSignals';
import TabStrategicMap from './tabs/TabStrategicMap';
import TabSources from './tabs/TabSources';

/**
 * Projection of `report.inputData` consumed by the Summary tab's STEEP echo
 * block. Both keys are optional — legacy reports may have neither, in which
 * case the echo block simply doesn't render.
 */
export interface InputProjection {
  globalSteep?: Partial<GlobalSteep>;
  sectorialSteep?: Partial<GlobalSteep>;
}

/** Shape we read from `report.resultData`. The backend stores JSONB so the
 *  source field is loosely typed; this interface is the projection we
 *  actually render.
 *
 *  Each block (scenarioPlanning, backcasting, strategicMap, sources) is
 *  filled in by its own /api/ai/analyze/* call, so individual blocks may be
 *  missing if a sub-call failed or is still in flight. The renderer tolerates
 *  any subset gracefully.
 *
 *  Field shapes track the demo-aligned analysis pipeline — see
 *  {@link AnalyzeSummary}, {@link ScenarioPlanning}, etc. in
 *  `lib/aiClient.ts` for the per-section contracts. */
export interface ResultData {
  executiveSummary?: string;
  scenarios?: Scenario[];
  weakSignals?: WeakSignal[];
  wildcards?: Wildcard[];
  keyUncertainties?: KeyUncertainty[];
  scenarioPlanning?: ScenarioPlanning;
  backcasting?: Backcasting;
  strategicMap?: StrategicMap;
  sources?: Sources;
}

type TabKey = 'res' | 'esc' | 'sp' | 'bc' | 'sig' | 'str' | 'src';

interface TabDef {
  key: TabKey;
  labelKey: string;
  available: (r: ResultData, input?: InputProjection) => boolean;
  render: (r: ResultData, input?: InputProjection) => JSX.Element | null;
}

/** Tab definitions in display order. `available` decides whether a tab is
 *  rendered at all — legacy reports that lack the F3 fields just don't get
 *  the new tabs rather than showing empty states everywhere. */
const TABS: TabDef[] = [
  {
    key: 'res',
    labelKey: 'report.results.tabs.summary',
    available: (r, input) =>
      !!r.executiveSummary ||
      (r.keyUncertainties?.length ?? 0) > 0 ||
      hasAnySteepValue(input),
    render: (r, input) => <TabSummary result={r} input={input} />,
  },
  {
    key: 'esc',
    labelKey: 'report.results.tabs.scenarios',
    available: (r) => (r.scenarios?.length ?? 0) > 0,
    render: (r) => <TabScenarios result={r} />,
  },
  {
    key: 'sp',
    labelKey: 'report.results.tabs.sp',
    available: (r) => {
      const p = r.scenarioPlanning;
      return !!p && (
        (p.drivingForces?.length ?? 0) > 0 ||
        (p.axes?.length ?? 0) > 0 ||
        (p.scenarioLogics?.length ?? 0) > 0
      );
    },
    render: (r) => <TabScenarioPlanning result={r} />,
  },
  {
    key: 'bc',
    labelKey: 'report.results.tabs.bc',
    available: (r) => (r.backcasting?.length ?? 0) > 0,
    render: (r) => <TabBackcasting result={r} />,
  },
  {
    key: 'sig',
    labelKey: 'report.results.tabs.signals',
    available: (r) => (r.weakSignals?.length ?? 0) > 0 || (r.wildcards?.length ?? 0) > 0,
    render: (r) => <TabSignals result={r} />,
  },
  {
    key: 'str',
    labelKey: 'report.results.tabs.str',
    available: (r) => (r.strategicMap?.length ?? 0) > 0,
    render: (r) => <TabStrategicMap result={r} />,
  },
  {
    key: 'src',
    labelKey: 'report.results.tabs.sources',
    available: (r) => {
      const s = r.sources;
      if (!s) return false;
      if ((s.sources?.length ?? 0) > 0) return true;
      if ((s.report?.length ?? 0) > 0) return true;
      if ((s.globalSteep?.length ?? 0) > 0) return true;
      if (s.bySection) {
        for (const k of Object.keys(s.bySection)) {
          if ((s.bySection[k as 'A' | 'B' | 'C' | 'D' | 'E']?.length ?? 0) > 0) return true;
        }
      }
      return false;
    },
    render: (r) => <TabSources result={r} />,
  },
];

interface Props {
  result: ResultData;
  input?: InputProjection;
}

/**
 * Renders the analysed body of a report as a tab strip + content panel.
 * Shared between {@link ReportPage} and {@link PublicSharePage} so both views
 * stay byte-for-byte identical.
 *
 * Tabs without data are hidden entirely — a report missing scenario-planning
 * (e.g. legacy or partial-failure) shows the remaining tabs without empty
 * placeholders.
 */
export default function ReportContent({ result, input }: Props) {
  const { t } = useTranslation();
  const visible = useMemo(
    () => TABS.filter((tb) => tb.available(result, input)),
    [result, input],
  );
  const [active, setActive] = useState<TabKey>(() => visible[0]?.key ?? 'res');

  if (visible.length === 0) return null;

  // Guard against `active` referring to a tab that became unavailable when
  // the data shape changed under us (e.g. a refetch). Falling back to the
  // first visible tab keeps the panel from rendering nothing.
  const activeTab = visible.find((tb) => tb.key === active) ?? visible[0];

  return (
    <div>
      <div className="tab-row" role="tablist">
        {visible.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            className={`tab-btn${tab.key === activeTab.key ? ' active' : ''}`}
            aria-selected={tab.key === activeTab.key}
            onClick={() => setActive(tab.key)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
      <div className="tab-panel">{activeTab.render(result, input)}</div>
    </div>
  );
}

function hasAnySteepValue(input: InputProjection | undefined): boolean {
  if (!input) return false;
  const g = input.globalSteep ?? {};
  const s = input.sectorialSteep ?? {};
  return (['S', 'T', 'E', 'ENV', 'P'] as const).some(
    (k) => (g[k] ?? '').trim().length > 0 || (s[k] ?? '').trim().length > 0,
  );
}
