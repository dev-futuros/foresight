import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import type { PortalPage } from '@kinde/js-utils';
import { useBillingProfile } from '../../hooks/useBilling';
import './pricing.css';

/**
 * Single-plan pricing page (slice 1 of Kinde Billing wiring). Reachable at `/pricing`,
 * protected — unauthenticated callers bounce through {@code ProtectedRoute} to sign-in
 * first. Shows the plan card with a CTA that branches on current subscription state:
 *
 * <ul>
 *   <li>No active plan → "Subscribe" button opens Kinde's hosted portal in a new tab
 *       on the plan-selection page. After the user pays they close the tab and our
 *       app refetches entitlements (TanStack Query's window-focus refetch will pick
 *       up the new plan within a few seconds).</li>
 *   <li>Plan already active → CTA flips to "Manage subscription" which lands on the
 *       plan-details page of the portal (cancel, change card, view invoices).</li>
 * </ul>
 *
 * <p>We bypass the SDK's {@code <PortalLink>} component because it forces same-tab
 * navigation — for billing actions, a new tab preserves the app state behind it so the
 * user comes back to where they were. Same trick as the "Manage in Kinde" button in
 * {@code AccountModal}.
 */
export default function PricingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { generatePortalUrl } = useKindeAuth();
  const { data: billing, isLoading } = useBillingProfile();
  const [portalOpening, setPortalOpening] = useState(false);

  const hasPlan = !!billing?.plan;

  async function openPortal(subNav: PortalPage) {
    if (portalOpening) return;
    setPortalOpening(true);
    try {
      const result = await generatePortalUrl({ subNav, returnUrl: window.location.href });
      window.open(result.url.toString(), '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to open Kinde portal:', err);
    } finally {
      setPortalOpening(false);
    }
  }

  return (
    <main className="pricing-page">
      <header className="pricing-header">
        <p className="pricing-eyebrow">{t('pricing.eyebrow')}</p>
        <h1 className="pricing-title">{t('pricing.title')}</h1>
        <p className="pricing-lede">{t('pricing.lede')}</p>
      </header>

      <section className="pricing-grid">
        <article className={`pricing-card${hasPlan ? ' pricing-card--active' : ''}`}>
          {hasPlan && <span className="pricing-card-badge">{t('pricing.currentPlan')}</span>}
          <h2 className="pricing-card-name">{t('pricing.plans.pro.name')}</h2>
          <p className="pricing-card-price">
            <span className="pricing-card-amount">{t('pricing.plans.pro.amount')}</span>
            <span className="pricing-card-cadence">{t('pricing.plans.pro.cadence')}</span>
          </p>
          <ul className="pricing-card-features">
            <li>{t('pricing.plans.pro.features.reports')}</li>
            <li>{t('pricing.plans.pro.features.trial')}</li>
          </ul>
          {isLoading ? (
            <button type="button" className="pricing-card-cta" disabled>
              {t('common.loading')}
            </button>
          ) : hasPlan ? (
            <button
              type="button"
              className="pricing-card-cta pricing-card-cta--secondary"
              disabled={portalOpening}
              onClick={() => {
                void openPortal('plan_details' as PortalPage);
              }}
            >
              {portalOpening ? t('pricing.opening') : t('pricing.manage')}
            </button>
          ) : (
            <button
              type="button"
              className="pricing-card-cta pricing-card-cta--primary"
              disabled={portalOpening}
              onClick={() => {
                void openPortal('plan_selection' as PortalPage);
              }}
            >
              {portalOpening ? t('pricing.opening') : t('pricing.subscribe')}
            </button>
          )}
        </article>
      </section>

      <p className="pricing-back">
        <button type="button" className="pricing-back-link" onClick={() => navigate('/reports/new')}>
          {t('pricing.backToApp')}
        </button>
      </p>
    </main>
  );
}
