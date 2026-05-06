import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * In-app footer — small, centered, top-bordered. Distinct from the auth
 * footer (which sits outside the card on the login page).
 */
export default function AppFooter() {
  const { t } = useTranslation();

  return (
    <footer className="app-footer">
      <div className="app-footer-row">
        <span>{t('auth.shell.copyright')}</span>
        <span className="sep">·</span>
        <Link to="/privacy">{t('auth.shell.privacyLink')}</Link>
        <span className="sep">·</span>
        <span>{t('auth.shell.contact')}</span>
      </div>
      <div className="app-footer-tag">{t('nav.footerTag')}</div>
    </footer>
  );
}
