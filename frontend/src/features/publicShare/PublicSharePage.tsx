import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePublicShare } from '../../hooks/useShare';
import ShareView, { type ShareReport } from './ShareView';
import type { PublicShareResponse } from '../../types/api';
import '../report/report.css';
import './publicShare.css';

type ShareLang = 'es' | 'en';

/**
 * Anonymous, read-only view of a shared report. Reachable at {@code /share/:token}
 * and bypasses Clerk / ProtectedRoute entirely so the recipient never has to
 * log in.
 *
 * <p>Owns data-fetching + loading/error states; the actual chrome and report
 * body live in {@link ShareView} so the same render path is reused by the
 * standalone HTML snapshot entry.
 *
 * <p>Multi-language shares: when the share token was frozen with cached
 * translations the public response carries them all, and we render a
 * language-switcher pill matching the in-app viewer's. The chosen
 * language is reflected in the URL ({@code ?lang=}) and persisted per
 * token in {@code localStorage} so refresh / navigate-away preserves it.
 */
export default function PublicSharePage() {
  const { t, i18n } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isLoading, isError } = usePublicShare(token ?? '');

  const langParam = searchParams.get('lang');
  const requestedLang: ShareLang | null =
    langParam === 'es' || langParam === 'en' ? langParam : null;

  // Per-token localStorage memory of the recipient's last language
  // choice, so navigating away from the share and back (or hard
  // refresh) doesn't reset the toggle. Read once at mount; updated
  // whenever the user picks a language via {@link chooseLanguage}
  // below.
  const storageKey = token ? `share-lang:${token}` : null;
  const [storedLang, setStoredLang] = useState<ShareLang | null>(() => {
    if (typeof window === 'undefined' || !storageKey) return null;
    try {
      const v = window.localStorage.getItem(storageKey);
      return v === 'es' || v === 'en' ? v : null;
    } catch {
      return null;
    }
  });

  // Resolve the active language against what the share actually carries.
  // Falls back through: explicit URL → stored preference → share's
  // primary language → 'es' default.
  const availableLangs = useMemo<ShareLang[]>(() => {
    if (!data) return ['es'];
    const list = (data.availableLanguages ?? []) as ShareLang[];
    return list.length > 0 ? list : [data.primaryLanguage ?? 'es'];
  }, [data]);
  const primaryLang: ShareLang = (data?.primaryLanguage as ShareLang | undefined) ?? 'es';
  const activeLang: ShareLang = (() => {
    if (requestedLang && availableLangs.includes(requestedLang)) return requestedLang;
    if (storedLang && availableLangs.includes(storedLang)) return storedLang;
    return primaryLang;
  })();

  // Switch i18n's UI language to the active report language so the
  // chrome around the report content (tab labels, etc.) matches what
  // the recipient is reading. Same pattern the legacy share page used,
  // just now driven by activeLang rather than the URL alone.
  useEffect(() => {
    const lang = searchParams.get('lang');
    if (lang && (lang === 'es' || lang === 'en' || lang === 'ca') && lang !== i18n.language) {
      void i18n.changeLanguage(lang);
    }
  }, [activeLang, i18n]);

  // Mirror URL-driven changes into localStorage so a deep-linked
  // ?lang=en arrival sticks across reloads.
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    if (requestedLang && availableLangs.includes(requestedLang)) {
      try {
        window.localStorage.setItem(storageKey, requestedLang);
        setStoredLang(requestedLang);
      } catch {
        /* private-browsing / storage-disabled — no-op. */
      }
    }
  }, [storageKey, requestedLang, availableLangs]);

  /**
   * Write the user's chosen language to both the URL and
   * localStorage. Called from the switcher pill. Primary language
   * uses a clean URL (no {@code ?lang}); non-primary writes the
   * param. {@code replace: true} so the toggle doesn't pile up in
   * the browser's history stack.
   */
  function chooseLanguage(lng: ShareLang) {
    const next = new URLSearchParams(searchParams);
    if (lng === primaryLang) next.delete('lang');
    else next.set('lang', lng);
    setSearchParams(next, { replace: true });
    if (storageKey && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(storageKey, lng);
        setStoredLang(lng);
      } catch {
        /* private-browsing / storage-disabled — no-op. */
      }
    }
  }

  // Build the report payload to feed ShareView. Primary language uses
  // the share's columns directly; any other available language reads
  // from the translations map the snapshot froze at share creation.
  // Returns null when there's no usable payload yet (loading state).
  const sharedReport = useMemo<ShareReport | null>(() => {
    if (!data) return null;
    const payload = pickPayloadForLanguage(data, activeLang, primaryLang);
    return {
      title: data.title,
      createdAt: data.createdAt,
      inputData: payload.inputData,
      resultData: payload.resultData,
    };
  }, [data, activeLang, primaryLang]);

  if (isLoading) {
    return (
      <div className="public-share">
        <header className="public-share-topbar">
          <div className="public-share-brand">
            <span className="public-share-brand-name">Futuros</span>
            <span className="public-share-brand-tag">{t('share.public.header')}</span>
          </div>
        </header>
        <main className="public-share-main report-page">
          <div className="public-share-state">{t('share.public.loading')}</div>
        </main>
        <footer className="public-share-footer">
          <span>FUTUROS · Foresight Strategy</span>
        </footer>
      </div>
    );
  }

  if (isError || !data || !sharedReport) {
    return (
      <div className="public-share">
        <header className="public-share-topbar">
          <div className="public-share-brand">
            <span className="public-share-brand-name">Futuros</span>
            <span className="public-share-brand-tag">{t('share.public.header')}</span>
          </div>
        </header>
        <main className="public-share-main report-page">
          <div className="public-share-state public-share-state--error">
            <h2>{t('share.public.expired')}</h2>
            <p>{t('share.public.expiredHelp')}</p>
          </div>
        </main>
        <footer className="public-share-footer">
          <span>FUTUROS · Foresight Strategy</span>
        </footer>
      </div>
    );
  }

  return (
    <ShareView
      report={sharedReport}
      languageSwitcher={
        availableLangs.length > 1 ? (
          <span
            className="report-lang-switch"
            role="tablist"
            aria-label={t('report.lang.switcherAria', { defaultValue: 'View report in language' })}
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
        ) : undefined
      }
    />
  );
}

/**
 * Pick the {@code inputData} / {@code resultData} pair for a given
 * language out of the public-share payload. Falls back to the primary
 * payload when the requested language isn't in the translations map —
 * shouldn't happen given the {@code availableLanguages} gate, but the
 * defensive fallback means a malformed response can't crash the page.
 */
function pickPayloadForLanguage(
  share: PublicShareResponse,
  lang: ShareLang,
  primary: ShareLang,
): { inputData: Record<string, unknown>; resultData: Record<string, unknown> | null } {
  if (lang === primary) {
    return { inputData: share.inputData, resultData: share.resultData };
  }
  const entry = share.translations?.[lang];
  if (entry) {
    return { inputData: entry.inputData, resultData: entry.resultData };
  }
  return { inputData: share.inputData, resultData: share.resultData };
}
