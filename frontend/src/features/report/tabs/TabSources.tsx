import { useTranslation } from 'react-i18next';
import type { SourceItem } from '../../../lib/aiClient';
import type { ResultData } from '../ReportContent';

type SectionId = 'A' | 'B' | 'C' | 'D' | 'E';
const SECTION_ORDER: SectionId[] = ['A', 'B', 'C', 'D', 'E'];

/**
 * Fuentes tab — port of the prototype's tab-src content.
 *
 * <p>Renders, in order:
 * <ul>
 *   <li>A summary chip showing the total number of unique sources</li>
 *   <li>The Global STEEP citations (step 2), if present</li>
 *   <li>Per-section citation buckets (sections A-E) for the analysis,
 *       when the backend surfaces them</li>
 *   <li>Otherwise: a single "Report" bucket with the flat sources list
 *       returned by the standalone /analyze/sources call (current
 *       backend behaviour)</li>
 * </ul>
 *
 * <p>Each source link shows the title above a small hostname pill — the
 * demo's two-line item layout. URLs open in a new tab with safe rel.
 */
export default function TabSources({ result }: { result: ResultData }) {
  const { t } = useTranslation();
  const s = result.sources;

  const reportList = s?.report ?? s?.sources ?? [];
  const globalList = s?.globalSteep ?? [];
  const bySection = s?.bySection ?? {};
  const hasGroupedSections = SECTION_ORDER.some((k) => (bySection[k]?.length ?? 0) > 0);

  // Empty state — neither the standalone /analyze/sources flat list nor
  // any of the demo-style buckets carry anything.
  if (reportList.length === 0 && globalList.length === 0 && !hasGroupedSections) {
    return <p className="src-empty">{t('report.results.sources.empty')}</p>;
  }

  const total = uniqueCount(reportList, globalList, bySection);

  return (
    <>
      <p className="bc-intro-txt">{t('report.results.sources.intro')}</p>

      <div className="src-summary">
        <span className="src-summary-num">{total}</span>{' '}
        <span className="src-summary-label">{t('report.results.sources.total')}</span>
      </div>

      {globalList.length > 0 && (
        <SourceSection
          label={t('report.results.sources.global')}
          count={globalList.length}
          items={globalList}
        />
      )}

      {hasGroupedSections
        ? SECTION_ORDER.map((sid) => {
            const list = bySection[sid] ?? [];
            if (list.length === 0) return null;
            return (
              <SourceSection
                key={sid}
                label={t(`report.results.sources.section${sid}` as const)}
                count={list.length}
                items={list}
              />
            );
          })
        : reportList.length > 0 && (
            <SourceSection
              label={t('report.results.sources.report')}
              count={reportList.length}
              items={reportList}
            />
          )}
    </>
  );
}

function SourceSection({
  label,
  count,
  items,
}: {
  label: string;
  count: number;
  items: SourceItem[];
}) {
  return (
    <div className="src-section">
      <div className="src-section-head">
        <span className="src-section-label">{label}</span>
        <span className="src-section-count">{count}</span>
      </div>
      <ul className="src-list">
        {items.map((it, i) => (
          <li key={`${it.url}-${i}`} className="src-item">
            <a
              className="src-link"
              href={it.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="src-title">{it.title || it.url}</span>
              <span className="src-host">{hostname(it.url)}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Compute the unique count of URLs across all buckets. The flat-list
 * variant returns reportList.length when present (the backend already
 * dedupes); the grouped variant collapses across `globalSteep` + all
 * `bySection` arrays.
 */
function uniqueCount(
  reportList: SourceItem[],
  globalList: SourceItem[],
  bySection: Partial<Record<SectionId, SourceItem[]>>,
): number {
  const seen = new Set<string>();
  const push = (items: SourceItem[]) => {
    for (const it of items) if (it.url) seen.add(it.url);
  };
  push(reportList);
  push(globalList);
  for (const k of SECTION_ORDER) {
    const arr = bySection[k];
    if (arr) push(arr);
  }
  return seen.size;
}
