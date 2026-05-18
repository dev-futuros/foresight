/** Pure HTTP fetchers for the billing feature. */
import api from '../../../lib/api';
import type { BillingProfileResponse } from '../../../types/api';

/**
 * Caller's billing snapshot (plan + per-period quota + usage). The
 * backend composes it from Kinde's Account API (plan/limit) and our
 * local report count (usage).
 */
export async function getBillingEntitlements() {
  const res = await api.get<BillingProfileResponse>('/billing/entitlements');
  return res.data;
}
