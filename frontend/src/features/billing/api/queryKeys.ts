/** Typed query keys for the billing feature. */
export const billingKeys = {
  all: ['billing'] as const,
  entitlements: () => [...billingKeys.all, 'entitlements'] as const,
};
