import { useEffect, useMemo, useState } from 'react';
import i18n from './i18n';
import IconSprite from './components/IconSprite';
import ShareView, { type ShareReport } from './features/publicShare/ShareView';

export type SnapshotLang = 'es' | 'en' | 'ca';

export interface LanguagePayload {
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
}

export interface SnapshotReport extends ShareReport {
  /** Report row id — used as the localStorage scope so each snapshot
   *  remembers its own language preference independently. */
  id?: string;
  primaryLanguage?: SnapshotLang;
  /** Optional cached-translation map. {@code null}/missing for legacy
   *  single-language snapshots; populated for multi-lingual ones. */
  translations?: Record<string, LanguagePayload> | null;
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
export function SnapshotApp({ report }: { report: SnapshotReport }) {
  const primaryLang: SnapshotLang = report.primaryLanguage ?? 'es';
  const availableLangs = useMemo<SnapshotLang[]>(() => {
    const fromTranslations = report.translations
      ? (Object.keys(report.translations) as SnapshotLang[]).filter(
          (l) => l === 'es' || l === 'en' || l === 'ca',
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
    if (fromTag === 'es' || fromTag === 'en' || fromTag === 'ca') return fromTag;
    return primaryLang;
  })();
  const initialLang: SnapshotLang = (() => {
    if (typeof window === 'undefined' || !storageKey) return defaultLang;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === 'es' || stored === 'en' || stored === 'ca') {
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
