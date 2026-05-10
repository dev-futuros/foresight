import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Backcasting,
  Scenario,
  ScenarioPlanning,
  Sources,
  StrategicMap,
} from '../../lib/aiClient';
import TabSummary from './tabs/TabSummary';
import TabScenarios from './tabs/TabScenarios';
import TabScenarioPlanning from './tabs/TabScenarioPlanning';
import TabBackcasting from './tabs/TabBackcasting';
import TabSignals from './tabs/TabSignals';
import TabStrategicMap from './tabs/TabStrategicMap';
import TabSources from './tabs/TabSources';

/** Shape we read from `report.resultData`. The backend stores JSONB so the
 *  source field is loosely typed; this interface is the projection we
 *  actually render.
 *
 *  Each block (scenarioPlanning, backcasting, strategicMap, sources) is
 *  filled in by its own /api/ai/analyze/* call, so individual blocks may be
 *  missing if a sub-call failed or is still in flight. The renderer tolerates
 *  any subset gracefully. */
export interface ResultData {
  scenarios?: Scenario[];
  weakSignals?: string[];
  wildcards?: string[];
  keyUncertainties?: string[];
  scenarioPlanning?: ScenarioPlanning;
  backcasting?: Backcasting;
  strategicMap?: StrategicMap;
  sources?: Sources;
}

type TabKey = 'res' | 'esc' | 'sp' | 'bc' | 'sig' | 'str' | 'src';

interface TabDef {
  key: TabKey;
  labelKey: string;
  available: (r: ResultData) => boolean;
  render: (r: ResultData) => JSX.Element | null;
}

/** Tab definitions in display order. `available` decides whether a tab is
 *  rendered at all — legacy reports that lack the F3 fields just don't get
 *  the new tabs rather than showing empty states everywhere. */
const TABS: TabDef[] = [
  {
    key: 'res',
    labelKey: 'report.results.tabs.summary',
    available: (r) =>
      (r.scenarios?.length ?? 0) > 0 || (r.keyUncertainties?.length ?? 0) > 0,
    render: (r) => <TabSummary result={r} />,
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
        (p.forces?.length ?? 0) > 0 ||
        (p.axes?.length ?? 0) > 0 ||
        (p.narrativeLogics?.length ?? 0) > 0
      );
    },
    render: (r) => <TabScenarioPlanning result={r} />,
  },
  {
    key: 'bc',
    labelKey: 'report.results.tabs.bc',
    available: (r) => (r.backcasting?.panels?.length ?? 0) > 0,
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
    available: (r) => {
      const m = r.strategicMap;
      return !!m && ((m.h1?.length ?? 0) + (m.h2?.length ?? 0) + (m.h3?.length ?? 0)) > 0;
    },
    render: (r) => <TabStrategicMap result={r} />,
  },
  {
    key: 'src',
    labelKey: 'report.results.tabs.sources',
    available: (r) => (r.sources?.sources?.length ?? 0) > 0,
    render: (r) => <TabSources result={r} />,
  },
];

interface Props {
  result: ResultData;
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
export default function ReportContent({ result }: Props) {
  const { t } = useTranslation();
  const visible = useMemo(() => TABS.filter((t) => t.available(result)), [result]);
  const [active, setActive] = useState<TabKey>(() => visible[0]?.key ?? 'res');

  if (visible.length === 0) return null;

  // Guard against `active` referring to a tab that became unavailable when
  // the data shape changed under us (e.g. a refetch). Falling back to the
  // first visible tab keeps the panel from rendering nothing.
  const activeTab = visible.find((t) => t.key === active) ?? visible[0];

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
      <div className="tab-panel">{activeTab.render(result)}</div>
    </div>
  );
}
