import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './cookies.css';

/**
 * Cookie consent banner. Ports the demo's vanilla `cookies.js` to
 * React + i18next.
 *
 * <p>The user's choice persists in localStorage under
 * {@code fs_cookie_consent} = "accepted" | "rejected" and is read
 * back on every mount so the banner stays hidden after a decision is
 * recorded.
 *
 * <p>Today the banner is a no-op — there are no analytics tools to
 * gate. The state machine (banner visibility, localStorage
 * persistence, debug shim on {@code window.fsCookies}) is kept here
 * intact as scaffolding for the upcoming Sentry / Mixpanel
 * integration: when those SDKs land, this is the place to wire
 * their opt-in / opt-out calls (see {@code applyConsent} below).
 *
 * <p>Power users can re-open it via {@code window.fsCookies.reset()}.
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
    // localStorage can throw in private-mode Safari or when disabled
    // by policy; banner still works in-memory for the current session.
  }
}

/**
 * Wire the chosen consent decision into the analytics SDKs.
 *
 * <p>Currently a no-op — PostHog has been removed and no successor
 * SDK is integrated yet. When Sentry replay / Mixpanel / Amplitude
 * land, fan out from here so the banner stays the single point of
 * truth for analytics opt-in. Examples:
 *
 * <pre>
 *   if (v === 'accepted') {
 *     Sentry.getReplay()?.start();
 *     mixpanel.opt_in_tracking();
 *   } else {
 *     Sentry.getReplay()?.stop();
 *     mixpanel.opt_out_tracking();
 *   }
 * </pre>
 */
function applyConsent(_v: 'accepted' | 'rejected'): void {
  // No analytics SDKs integrated yet — see jsdoc.
}

export default function CookieConsent() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  // Replay any prior consent the moment we mount, BEFORE deciding
  // visibility. Without this, the banner would flash on every page
  // load until the user re-clicked Accept even though we already
  // have their answer on file.
  useEffect(() => {
    const prior = readConsent();
    if (prior) {
      applyConsent(prior);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount-time resolution of localStorage-stored consent
      setVisible(false);
    } else {
      setVisible(true);
    }
    // Debug shim that matches the demo's API.
    // `window.fsCookies.reset()` clears the stored consent and
    // re-opens the banner — handy when QAing the flow.
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
    applyConsent('accepted');
    setVisible(false);
  };
  const reject = () => {
    writeConsent('rejected');
    applyConsent('rejected');
    setVisible(false);
  };

  return (
    <div
      className="fs-cookies fs-cookies-show"
      role="dialog"
      aria-live="polite"
      aria-label="Cookies consent"
    >
      <div className="fs-cookies-text">
        <div className="fs-cookies-title">{t('cookies.title')}</div>
        <div className="fs-cookies-body">
          {t('cookies.body')} <Link to="/privacy">{t('cookies.learn')}</Link>.
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
