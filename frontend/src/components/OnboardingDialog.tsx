import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';

type Props = {
  open: boolean;
  /** Called when the user closes the dialog. `dontShowAgain` is true if the
   *  "don't show again" checkbox was ticked — caller should persist that
   *  to localStorage / backend so the dialog doesn't reappear. */
  onClose: (dontShowAgain: boolean) => void;
  /** Optional. When provided, a secondary "Load example" button is rendered
   *  next to the primary action. Caller is responsible for fetching the
   *  example data + populating the wizard state, then dismissing the dialog. */
  onLoadExample?: (dontShowAgain: boolean) => void;
};

const STEP_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6'] as const;
type StepKey = (typeof STEP_KEYS)[number];

/**
 * First-run welcome dialog for /reports/new. Mirrors the prototype's
 * `.ob-modal` block — gold-accented card with brand mark, eyebrow tag pill,
 * Playfair title, descriptor, numbered step list, primary action, and a
 * "don't show again" checkbox. Per-device persistence is the caller's
 * responsibility (this component just reports the user's checkbox state).
 */
export default function OnboardingDialog({ open, onClose, onLoadExample }: Props) {
  const { t } = useTranslation();
  const [noShow, setNoShow] = useState(false);

  function handleClose() {
    onClose(noShow);
  }
  function handleLoadExample() {
    onLoadExample?.(noShow);
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      ariaLabel={`${t('onboarding.titleLine1')} ${t('onboarding.titleLine2')}`}
      dialogClassName="modal-dialog--onboarding"
    >
      <div className="onboarding">
        <header className="onboarding-header">
          <span className="onboarding-brand-name">Futuros</span>
          <span className="onboarding-tag">{t('onboarding.tag')}</span>
        </header>

        <h2 className="onboarding-title">
          {t('onboarding.titleLine1')}
          <br />
          {t('onboarding.titleLine2')}
        </h2>
        <p className="onboarding-desc">{t('onboarding.desc')}</p>

        <ol className="onboarding-steps">
          {STEP_KEYS.map((k: StepKey, i) => (
            <li key={k} className="onboarding-step">
              <span className="onboarding-num">{i + 1}</span>
              <span className="onboarding-step-text">
                <strong>{t(`onboarding.steps.${k}.title`)}</strong>{' '}
                {t(`onboarding.steps.${k}.desc`)}
              </span>
            </li>
          ))}
        </ol>

        <div className="onboarding-actions">
          {onLoadExample && (
            <button
              type="button"
              className="modal-btn"
              onClick={handleLoadExample}
            >
              {t('onboarding.exampleBtn')}
            </button>
          )}
          <button
            type="button"
            className="modal-btn modal-btn--primary"
            onClick={handleClose}
            autoFocus
          >
            {t('onboarding.startBtn')}
          </button>
        </div>

        <label className="onboarding-checkbox">
          <input
            type="checkbox"
            checked={noShow}
            onChange={(e) => setNoShow(e.target.checked)}
          />
          {t('onboarding.noShow')}
        </label>
      </div>
    </Modal>
  );
}
