import { useTranslation } from 'react-i18next';

const LANGUAGES = ['es', 'en'] as const;
type Lang = (typeof LANGUAGES)[number];

/**
 * In-card language toggle pill (ES · EN). Mirrors the prototype's `.lang-toggle`
 * markup so the styles in auth.css apply 1:1.
 */
export default function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const active = (i18n.resolvedLanguage ?? i18n.language).slice(0, 2) as Lang;

  return (
    <div className="lang-toggle" aria-label={t('auth.shell.langAria')}>
      {LANGUAGES.map((lang, idx) => (
        <span key={lang}>
          <button
            type="button"
            className={`l-opt${active === lang ? ' active' : ''}`}
            onClick={() => i18n.changeLanguage(lang)}
            aria-pressed={active === lang}
          >
            {lang.toUpperCase()}
          </button>
          {idx < LANGUAGES.length - 1 && <span className="l-sep">·</span>}
        </span>
      ))}
    </div>
  );
}
