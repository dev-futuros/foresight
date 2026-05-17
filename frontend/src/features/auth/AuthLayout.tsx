import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import LanguageToggle from '../../components/LanguageToggle';

type AuthLayoutProps = {
  /** Translation key root for the eyebrow / title / description copy. */
  copyKey: 'auth.login' | 'auth.register' | 'auth.loggedOut';
  /** The Clerk component (or any auth form) to render inside the card. */
  children: ReactNode;
};

/**
 * Atmospheric login/sign-up shell — ported from demo.futuros.io/src/prod/index.html.
 *
 * Renders the prototype's atmospheric background, gold-accented brand mark,
 * eyebrow / title / lede, a slot for the auth form (Clerk SignIn or SignUp),
 * a consent line, and the outer footer note + meta row. The in-card language
 * toggle wires to i18next.
 */
export default function AuthLayout({ copyKey, children }: AuthLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="auth-bg">
      {/* Atmospheric background — fixed, behind everything */}
      <div className="atmosphere" aria-hidden="true">
        <div className="grid" />
      </div>

      <main className="card auth-card" role="main">
        <LanguageToggle />

        <header className="brand">
          <div className="brand-text">
            <span className="brand-name">Futuros</span>
            <span className="brand-tag">{t('auth.shell.brandTag')}</span>
          </div>
        </header>

        <p className="eyebrow">{t(`${copyKey}.eyebrow`)}</p>
        <h1>{t(`${copyKey}.title`)}</h1>
        <p className="lede">{t(`${copyKey}.description`)}</p>

        <div className="auth-form-slot">{children}</div>

        <p className="consent-line">
          <Trans i18nKey="auth.shell.consent" components={{ a: <a href="/privacy" /> }} />
        </p>
      </main>

      <p className="footer-note">{t('auth.shell.footerLine')}</p>
      <p className="footer-meta">
        <span>{t('auth.shell.copyright')}</span>
        <span className="sep">·</span>
        <a href="/privacy" className="privacy-link">
          {t('auth.shell.privacyLink')}
        </a>
        <span className="sep">·</span>
        <span>{t('auth.shell.contact')}</span>
      </p>
    </div>
  );
}
