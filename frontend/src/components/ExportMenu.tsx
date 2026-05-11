import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type ExportLanguage = 'es' | 'en';

interface Props {
  /** Whether the parent action is currently in flight. Reflected as a
   *  disabled-button + spinner-ish "…" affordance; while true, clicks on
   *  PDF / PPT items are ignored. */
  busy?: boolean;
  /** Fires when the user picks PDF. The language argument reflects the
   *  picker state — parent uses it to translate the report payload before
   *  rendering, when it differs from the report's primary language. */
  onPdf: (language: ExportLanguage) => void;
  onPpt: (language: ExportLanguage) => void;
  /** Class on the trigger button. Defaults to {@code 'db-r-btn'} (the
   *  dashboard card variant). Pass {@code 'btn'} to use the report page's
   *  larger ghost-button look that matches the demo's results header. */
  triggerClassName?: string;
  /** The report's primary language — pre-selected in the picker. */
  primaryLanguage?: ExportLanguage;
  /** When {@code true}, omit the language selector entirely (e.g. for
   *  the dashboard's per-row export when we don't yet have the
   *  detailed report data on hand). */
  hideLanguagePicker?: boolean;
}

/**
 * Compact "Export" dropdown — a trigger button + a small menu with PDF and
 * PowerPoint options. Mirrors the staging demo's per-card export pattern.
 *
 * <p>Self-contained: tracks its own open state, closes on outside click,
 * Escape, or after selecting an item. Lives inside {@code .db-r-actions}
 * (or any flex row) and positions the menu absolutely below the button.
 */
export default function ExportMenu({
  busy,
  onPdf,
  onPpt,
  triggerClassName = 'db-r-btn',
  primaryLanguage = 'es',
  hideLanguagePicker = false,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<ExportLanguage>(primaryLanguage);
  const ref = useRef<HTMLDivElement>(null);

  // Sync the picker to the report's primary language when the parent
  // changes which report this menu belongs to.
  useEffect(() => {
    setLanguage(primaryLanguage);
  }, [primaryLanguage]);

  // Close on outside click. We attach to mousedown so the menu disappears
  // before any subsequent click handler fires — otherwise the user can
  // see a click "go through" the menu to whatever was behind it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const node = ref.current;
      if (node && !node.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handlePdf(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setOpen(false);
    onPdf(language);
  }
  function handlePpt(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setOpen(false);
    onPpt(language);
  }

  return (
    <div className="export-dropdown" ref={ref}>
      <button
        type="button"
        className={triggerClassName}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        title={t('dashboard.actions.export')}
      >
        <svg className="db-r-btn-ico" aria-hidden>
          <use href="#i-dl" />
        </svg>
        {busy ? '…' : t('dashboard.actions.export')}
        <svg className="db-r-btn-chev" aria-hidden>
          <use href="#i-chev" />
        </svg>
      </button>
      {open && (
        <div className="export-menu open" role="menu">
          <button
            type="button"
            className="export-item compact"
            role="menuitem"
            onClick={handlePdf}
          >
            <span className="export-item-name">PDF</span>
            <span className="export-item-meta">{t('dashboard.actions.pdfMeta')}</span>
          </button>
          <button
            type="button"
            className="export-item compact"
            role="menuitem"
            onClick={handlePpt}
          >
            <span className="export-item-name">PowerPoint</span>
            <span className="export-item-meta">{t('dashboard.actions.pptMeta')}</span>
          </button>
          {!hideLanguagePicker && (
            <div className="export-lang-row">
              <span className="export-lang-label">
                {t('share.language', { defaultValue: 'Language' })}
              </span>
              <div className="export-lang-toggle" role="group">
                <button
                  type="button"
                  className={`export-lang-btn${language === 'es' ? ' active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setLanguage('es');
                  }}
                >
                  ES
                </button>
                <button
                  type="button"
                  className={`export-lang-btn${language === 'en' ? ' active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setLanguage('en');
                  }}
                >
                  EN
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
