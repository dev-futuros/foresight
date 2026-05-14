import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as posthog from '../../lib/posthog';
import './cookies.css';

/**
 * Cookie consent banner. Ports the demo's vanilla `cookies.js` to React + i18next.
 *
 * <p>PostHog ships with `opt_out_capturing_by_default: true` (see `index.html`), so
 * nothing is recorded until the user clicks Accept here. Choice persists in
 * localStorage under {@code fs_cookie_consent} = "accepted" | "rejected" and is
 * replayed against the SDK on every mount so the banner stays in sync after a
 * reload.
 *
 * <p>Banner hides itself once a decision is recorded. Power users can re-open it via
 * the debug helper on `window.fsCookies.reset()` (mirrors the demo's API).
 */
const STORAGE_KEY = 'fs_cookie_consent';

type Consent = 'accepted' | 'rejected' | null;

function readConsent(): Consent {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'accepted' || v === 'rejected' ? v : null;
  } catch {
    return null;
  }
}

function writeConsent(v: 'accepted' | 'rejected'): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // localStorage can throw in private-mode Safari or when disabled by policy;
    // banner still works in-memory for the current session.
  }
}

function applyToPostHog(v: 'accepted' | 'rejected'): void {
  if (v === 'accepted') {
    posthog.optIn();
    // The pageview that ran before opt-in was dropped by PostHog; record it now
    // so the dashboard sees the route the user landed on.
    posthog.capture('$pageview');
  } else {
    posthog.optOut();
  }
}

export default function CookieConsent() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  // Replay any prior consent the moment we mount, BEFORE deciding visibility.
  // Without this, the banner would flash on every page load until the user
  // re-clicked Accept even though we already have their answer on file.
  useEffect(() => {
    const prior = readConsent();
    if (prior) {
      applyToPostHog(prior);
      setVisible(false);
    } else {
      setVisible(true);
    }
    // Debug shim that matches the demo's API. `window.fsCookies.reset()` clears
    // the stored consent and re-opens the banner — handy when QAing the flow.
    interface FsCookiesShim {
      open: () => void;
      reset: () => void;
    }
    const shim: FsCookiesShim = {
      open: () => setVisible(true),
      reset: () => {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignored — localStorage may be disabled
        }
        setVisible(true);
      },
    };
    (window as unknown as { fsCookies?: FsCookiesShim }).fsCookies = shim;
  }, []);

  if (!visible) return null;

  const accept = () => {
    writeConsent('accepted');
    applyToPostHog('accepted');
    setVisible(false);
  };
  const reject = () => {
    writeConsent('rejected');
    applyToPostHog('rejected');
    setVisible(false);
  };

  return (
    <div className="fs-cookies fs-cookies-show" role="dialog" aria-live="polite" aria-label="Cookies consent">
      <div className="fs-cookies-text">
        <div className="fs-cookies-title">{t('cookies.title')}</div>
        <div className="fs-cookies-body">
          {t('cookies.body')}{' '}
          <Link to="/privacy">{t('cookies.learn')}</Link>.
        </div>
      </div>
      <div className="fs-cookies-actions">
        <button type="button" className="fs-cookies-reject" onClick={reject}>
          {t('cookies.reject')}
        </button>
        <button type="button" className="fs-cookies-accept" onClick={accept}>
          {t('cookies.accept')}
        </button>
      </div>
    </div>
  );
}
