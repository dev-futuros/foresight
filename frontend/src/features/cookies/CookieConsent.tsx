import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as Sentry from '@sentry/react';
import { optIn as mixpanelOptIn, optOut as mixpanelOptOut, track } from '../../lib/mixpanel';
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
 * Wire the chosen consent decision into the analytics SDKs. The
 * banner is the single point of truth for analytics opt-in.
 *
 * <p>Two SDKs are gated here:
 * <ul>
 *   <li><b>Sentry session replay</b> — errors still capture without
 *       consent (anonymous JS stacks aren't PII), but the
 *       screen-recording replay only runs after the user accepts.</li>
 *   <li><b>Mixpanel</b> — initialised with
 *       {@code opt_out_tracking_by_default: true}, so NO events are
 *       sent until {@link mixpanelOptIn} fires here. Accept arms
 *       it; reject (or no decision) keeps it silent.</li>
 * </ul>
 *
 * <p>Both SDKs no-op safely when their respective env var is unset
 * (Sentry DSN / Mixpanel token), so this stays correct in local dev
 * regardless of which (if any) is configured.
 */
function applyConsent(v: 'accepted' | 'rejected'): void {
  const replay = Sentry.getReplay();
  if (v === 'accepted') {
    replay?.start();
    mixpanelOptIn();
  } else {
    // stop() returns a promise; fire-and-forget is fine here — we
    // just want the recorder turned off, we don't need to wait for
    // its buffer flush before resolving the click handler.
    void replay?.stop();
    mixpanelOptOut();
  }
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
    // Track AFTER applyConsent so the optIn() has armed Mixpanel
    // — otherwise this first call would be dropped at the SDK
    // layer (still opted out). There's no symmetric reject event:
    // on decline Mixpanel stays opted out, so any track() call
    // would be a silent no-op.
    track('Cookie Consent Granted');
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
