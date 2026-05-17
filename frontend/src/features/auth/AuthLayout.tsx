import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

type AuthLayoutProps = {
  /** Render slot for the call-to-action (currently just the LoggedOut "Sign in again" button). */
  children: ReactNode;
};

/**
 * Atmospheric shell for the React-side auth pages. After we removed the
 * sign-in / sign-up splash routes (the Kinde-hosted pages cover those
 * directly now), this layout only ever wraps `/logged-out` — so the copy
 * is hardcoded to the `auth.loggedOut` namespace instead of being keyed
 * by a `copyKey` prop.
 *
 * Visual: atmospheric background, gold-accented Futuros wordmark, eyebrow
 * + title + lede, a button slot for the CTA, and a consent line. No
 * footer line and no in-page language switcher — the page's language is
 * already known via the URL param (or i18next's localStorage cache) when
 * the app redirects users here on sign-out.
 */
export default function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="auth-bg">
      {/* Atmospheric background — fixed, behind everything */}
      <div className="atmosphere" aria-hidden="true">
        <div className="grid" />
      </div>

      <main className="card auth-card" role="main">
        <header className="brand">
          <div className="brand-text">
            <span className="brand-name">Futuros</span>
            <span className="brand-tag">{t('auth.shell.brandTag')}</span>
          </div>
        </header>

        <p className="eyebrow">{t('auth.loggedOut.eyebrow')}</p>
        <h1>{t('auth.loggedOut.title')}</h1>
        <p className="lede">{t('auth.loggedOut.description')}</p>

        <div className="auth-form-slot">{children}</div>

        <p className="consent-line">
          <Trans i18nKey="auth.shell.consent" components={{ a: <a href="/privacy" /> }} />
        </p>
      </main>
    </div>
  );
}
