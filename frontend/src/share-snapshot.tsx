import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import i18n from './i18n';
import IconSprite from './components/IconSprite';
import ShareView, { type ShareReport } from './features/publicShare/ShareView';

/**
 * Standalone snapshot entry — the React app that boots inside the
 * downloaded HTML file uploaded to a static bucket.
 *
 * <p>Contract: the HTML export injects two pieces of data into the host
 * page before this module runs:
 *
 * <ul>
 *   <li>A {@code <script id="report-data" type="application/json">} tag
 *       carrying the serialised report PLUS its cached translations.
 *       Shape mirrors a multi-lingual share token:
 *       {@code {id, title, primaryLanguage, inputData, resultData,
 *       translations: {<lang>: {inputData, resultData}, …}}}.</li>
 *   <li>An optional {@code <script id="report-lang">} tag carrying the
 *       ISO-639-1 code the snapshot should open in. Falls back to
 *       {@code report.primaryLanguage}, then Spanish.</li>
 * </ul>
 *
 * <p>If either tag is missing (e.g. someone opens the HTML directly
 * without going through the export pipeline), we render an error
 * placeholder rather than crashing.
 *
 * <p>Multi-lingual snapshots render the same {@link ShareView} the
 * public share page uses, with a language switcher pill in the tab
 * row's right slot. The active language is mirrored into the document
 * (and into {@code i18n}) and persisted to {@code localStorage} so
 * navigating tabs / re-opening the file remembers the recipient's
 * choice without needing a {@code ?lang=} URL parameter (snapshots
 * may be opened over {@code file://} where URL params are awkward).
 */

type SnapshotLang = 'es' | 'en';

interface LanguagePayload {
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
}

interface SnapshotReport extends ShareReport {
  /** Carried so the snapshot can default the language without the export
   *  needing to inject a separate marker tag. */
  primaryLanguage?: 'es' | 'en' | 'ca';
}

function readJsonTag<T>(id: string): T | null {
  const el = document.getElementById(id);
  if (!el || !el.textContent) return null;
  try {
    return JSON.parse(el.textContent) as T;
  } catch {
    return null;
  }
}

function readTextTag(id: string): string | null {
  const el = document.getElementById(id);
  return el?.textContent?.trim() || null;
}

/**
 * Renders the snapshot. Split out as a real React component so we can
 * use hooks for the language switcher's state — the top-level
 * {@code boot} stays a thin imperative bootstrap.
 */
function SnapshotApp({ report }: { report: SnapshotReport }) {
  const primaryLang: SnapshotLang = report.primaryLanguage ?? 'es';
  const availableLangs = useMemo<SnapshotLang[]>(() => {
    const fromTranslations = report.translations
      ? (Object.keys(report.translations) as SnapshotLang[]).filter(
          (l) => l === 'es' || l === 'en',
        )
      : [];
    const set = new Set<SnapshotLang>([primaryLang, ...fromTranslations]);
    // Stable order: primary first, others alphabetical.
    return [primaryLang, ...Array.from(set).filter((l) => l !== primaryLang).sort()];
  }, [report.translations, primaryLang]);

  // Default-open language: report-lang tag → primary. Persisted choice
  // (if any) wins on subsequent loads via localStorage.
  const storageKey = report.id ? `snapshot-lang:${report.id}` : null;
  const defaultLang: SnapshotLang = (() => {
    const fromTag = readTextTag('report-lang');
    if (fromTag === 'es' || fromTag === 'en') return fromTag;
    return primaryLang;
  })();
  const initialLang: SnapshotLang = (() => {
    if (typeof window === 'undefined' || !storageKey) return defaultLang;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === 'es' || stored === 'en') {
        if (availableLangs.includes(stored)) return stored;
      }
    } catch {
      /* private-browsing / storage-disabled — fall through. */
    }
    return defaultLang;
  })();
  const [activeLang, setActiveLang] = useState<SnapshotLang>(initialLang);

  // Keep i18n + the document language attribute in sync with the
  // active report language so UI chrome (tab labels, dimension
  // names, etc.) matches what the recipient is reading.
  useEffect(() => {
    if (i18n.language?.slice(0, 2) !== activeLang.slice(0, 2)) {
      void i18n.changeLanguage(activeLang);
    }
    document.documentElement.setAttribute('lang', activeLang);
  }, [activeLang]);

  // Resolve which payload to render for the active language. Primary
  // lives on the top-level fields; everything else comes from the
  // translations map.
  const activePayload: LanguagePayload =
    activeLang === primaryLang
      ? { inputData: report.inputData, resultData: report.resultData }
      : report.translations?.[activeLang] ?? {
          inputData: report.inputData,
          resultData: report.resultData,
        };

  const shareReport: ShareReport = {
    title: report.title,
    createdAt: report.createdAt,
    inputData: activePayload.inputData,
    resultData: activePayload.resultData,
  };

  function chooseLanguage(lng: SnapshotLang) {
    setActiveLang(lng);
    if (storageKey && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(storageKey, lng);
      } catch {
        /* private-browsing / storage-disabled — no-op. */
      }
    }
  }

  // The switcher renders the same pill as the share viewer (reusing
  // the `.report-lang-switch*` styles). Only paints when 2+ languages
  // are baked into the snapshot — a single-language artefact looks
  // identical to the legacy single-language snapshot.
  const switcher =
    availableLangs.length > 1 ? (
      <span
        className="report-lang-switch"
        role="tablist"
        aria-label={i18n.t('report.lang.switcherAria', {
          defaultValue: 'View report in language',
        })}
      >
        {availableLangs.map((lng) => {
          const isActive = lng === activeLang;
          return (
            <button
              key={lng}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`report-lang-switch-btn${isActive ? ' active' : ''}`}
              onClick={() => chooseLanguage(lng)}
            >
              {lng.toUpperCase()}
            </button>
          );
        })}
      </span>
    ) : undefined;

  return (
    <>
      <IconSprite />
      <ShareView report={shareReport} languageSwitcher={switcher} />
    </>
  );
}

async function boot(): Promise<void> {
  const report = readJsonTag<SnapshotReport>('report-data');
  if (!report) {
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML =
        '<div style="padding:48px;text-align:center;font-family:system-ui;color:#888">' +
        'No report data found in this snapshot.' +
        '</div>';
    }
    return;
  }
  const requestedLang =
    (readTextTag('report-lang') as 'es' | 'en' | 'ca' | null) ??
    report.primaryLanguage ??
    'es';
  if (i18n.language?.slice(0, 2) !== defaultLang.slice(0, 2)) {
    await i18n.changeLanguage(defaultLang);
  }
  // No StrictMode — second-render side effects (i18n switches, scroll
  // measurements in ReportContent) are noisy in a standalone artefact
  // that has no React DevTools attached anyway.
  createRoot(document.getElementById('root')!).render(<SnapshotApp report={report} />);
}

void boot();
