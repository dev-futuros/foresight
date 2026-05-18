/**
 * Typed query keys for the account feature.
 *
 * The key is `me` (singular) rather than `account` because we used to
 * key the raw query with `['me']` and the migration is friendlier when
 * the runtime cache key is unchanged — any persisted/migrated caches
 * keep hitting after the refactor.
 */
export const accountKeys = {
  all: ['me'] as const,
  me: () => [...accountKeys.all] as const,
};
