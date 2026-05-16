import {
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
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

/**
 * Normalise a STEEP block into the canonical `S | T | E | ENV | P`
 * shape consumed by the renderer. The wizard's StepGlobal saves with
 * short codes, but StepSteep (sectorial) saves with the localized
 * full names (`social`, `technological`, …). This helper accepts
 * either format so the renderer doesn't need to know which step
 * produced the data.
 */
function normalizeSteepKeys(
  s: Partial<GlobalSteep> | Record<string, unknown> | undefined,
): Partial<GlobalSteep> | undefined {
  if (!s) return s;
  const src = s as Record<string, unknown>;
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = src[k];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    return undefined;
  };
  const out: Partial<GlobalSteep> = {};
  const S = pick('S', 'social', 'Social');
  const T = pick('T', 'technological', 'Technological', 'tecnológico', 'tecnologico');
  const E = pick('E', 'economic', 'Economic', 'económico', 'economico');
  const ENV = pick('ENV', 'environmental', 'Environmental', 'medioambiental');
  const P = pick('P', 'political', 'Political', 'político', 'politico');
  if (S) out.S = S;
  if (T) out.T = T;
  if (E) out.E = E;
  if (ENV) out.ENV = ENV;
  if (P) out.P = P;
  return out;
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
  render: (r: ResultData, input?: InputProjection) => ReactElement | null;
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
  /**
   * Optional content rendered on the right side of the sticky tab row.
   * Typically the language-switcher pill — caller decides whether to
   * show it (multi-language report) or omit it (single-language).
   * Anchored to the right edge via {@code margin-left: auto}; pins
   * with the row as the user scrolls so the language toggle stays
   * accessible.
   */
  rightSlot?: ReactNode;
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
export default function ReportContent({ result, input, rightSlot }: Props) {
  const { t } = useTranslation();
  const tabRowRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Normalise both STEEP blocks once so every downstream consumer
  // (tab availability check + render) sees the canonical key shape.
  const normalizedInput = useMemo<InputProjection | undefined>(
    () =>
      input
        ? {
            globalSteep: normalizeSteepKeys(input.globalSteep),
            sectorialSteep: normalizeSteepKeys(input.sectorialSteep),
          }
        : undefined,
    [input],
  );
  const visible = useMemo(
    () => TABS.filter((tb) => tb.available(result, normalizedInput)),
    [result, normalizedInput],
  );
  const [active, setActive] = useState<TabKey>(() => visible[0]?.key ?? 'res');

  if (visible.length === 0) return null;

  // Guard against `active` referring to a tab that became unavailable when
  // the data shape changed under us (e.g. a refetch). Falling back to the
  // first visible tab keeps the panel from rendering nothing.
  const activeTab = visible.find((tb) => tb.key === active) ?? visible[0];

  /**
   * Scroll so the panel's top edge sits just below the sticky tab-row.
   * Works whether the user is at the report header (need to scroll
   * down) or deep inside the previous panel's content (need to scroll
   * up). Reads the row's computed `top` so it stays correct in both
   * the authenticated app (top: 118px) and the public-share page
   * (top: 0) without branching on context.
   */
  function handleTabClick(key: TabKey) {
    setActive(key);
    // Defer the scroll one frame so the new panel has rendered — its
    // height affects nothing here, but its content start is the
    // semantic target of the scroll.
    requestAnimationFrame(() => {
      const row = tabRowRef.current;
      const panel = panelRef.current;
      if (!row || !panel) return;
      const stickyTop = parseFloat(getComputedStyle(row).top) || 0;
      const rowRect = row.getBoundingClientRect();
      // The tab row is "pinned" when its top edge has reached the
      // sticky offset (or is below it in the rare overscroll case).
      // While the row is still in its natural position further down
      // the page, the user is at/near the report header — yanking
      // them down on a tab click feels jarring and breaks the natural
      // reading order. Bail out; just swap the panel and let the user
      // keep their scroll position. Once the row is pinned (user is
      // already deep in panel content), tab switches reset to the
      // start of the newly selected panel.
      const isPinned = rowRect.top <= stickyTop + 1;
      if (!isPinned) return;
      const rowH = row.offsetHeight;
      // Visual breathing room between the pinned tab row and the
      // start of the new panel — without it the panel content butts
      // up against the row and the eye doesn't get a moment to
      // register the section change.
      const breathingRoom = 16;
      const panelDocTop = window.scrollY + panel.getBoundingClientRect().top;
      const targetY = Math.max(
        0,
        panelDocTop - stickyTop - rowH - breathingRoom,
      );
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    });
  }

  return (
    <div>
      <div className="tab-row" role="tablist" ref={tabRowRef}>
        {visible.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            className={`tab-btn${tab.key === activeTab.key ? ' active' : ''}`}
            aria-selected={tab.key === activeTab.key}
            onClick={() => handleTabClick(tab.key)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
        {/* Right-anchored slot (typically the language switcher).
            `margin-left: auto` on the slot pushes it to the right of
            the flex row while leaving the tabs left-aligned. Pinned
            with the row so it stays accessible during long-scroll
            reads. Omitted when the caller has nothing to render. */}
        {rightSlot && <div className="tab-row-right">{rightSlot}</div>}
      </div>
      {/* Keyed on the active tab id so React unmounts the previous tab's
          subtree and mounts a fresh one when the user switches — that
          restarts the CSS fade-in animation on .tab-panel cleanly, with
          no need for a transition library. */}
      <div className="tab-panel" key={activeTab.key} ref={panelRef}>
        {activeTab.render(result, normalizedInput)}
      </div>
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
