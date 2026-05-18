import { useCallback, useEffect, useState } from 'react';

/**
 * Onboarding dialog state for the wizard.
 *
 * <p>Visibility decisions:
 * <ul>
 *   <li>Skip in edit mode — the user has clearly used the wizard before.</li>
 *   <li>Skip if the user previously checked "don't show again"
 *       (persisted in localStorage).</li>
 *   <li>Skip if the dialog has already been shown once in this browser
 *       session (sessionStorage; cleared by useLogout on sign-out).</li>
 * </ul>
 *
 * Returns {@code showOnboarding} for the dialog's `open` prop and
 * {@code handleClose} for its `onClose` callback. {@code handleClose}
 * persists the "don't show again" flag when called with {@code true}.
 */
const ONBOARDING_DISMISSED_KEY = 'fs_onboarding_dismissed';
/** sessionStorage key — set the first time the dialog auto-shows in
 *  this browser session. Stops the dialog re-appearing every time the
 *  user clicks "New report"; "first entry" semantics are scoped to
 *  the session, not the device. */
const ONBOARDING_SESSION_KEY = 'fs_onboarding_seen_this_session';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function persistDismissed() {
  try {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
  } catch {
    /* private mode / quota — silently ignore */
  }
}

function readSeenThisSession(): boolean {
  try {
    return sessionStorage.getItem(ONBOARDING_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeenThisSession() {
  try {
    sessionStorage.setItem(ONBOARDING_SESSION_KEY, '1');
  } catch {
    /* private mode / quota — silently ignore */
  }
}

export function useWizardOnboarding(args: { editMode: boolean }) {
  const [show, setShow] = useState(
    () => !args.editMode && !readDismissed() && !readSeenThisSession(),
  );

  // Persist the session flag the first time we actually decided to
  // show the dialog this mount. Doing it in an effect (not the
  // useState initialiser) keeps StrictMode's double-invoke harmless —
  // the initialiser can run twice, but the effect only runs once per
  // real mount.
  useEffect(() => {
    if (show) markSeenThisSession();
    // Empty deps: only record the very first showing. Later
    // setShow(false) doesn't revisit this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = useCallback((dontShowAgain: boolean) => {
    if (dontShowAgain) persistDismissed();
    setShow(false);
  }, []);

  return { show, handleClose };
}
