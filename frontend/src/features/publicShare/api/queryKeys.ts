/** Typed query keys for the public-share feature. */
export const shareKeys = {
  all: ['publicShare'] as const,
  byToken: (token: string) => [...shareKeys.all, token] as const,
};
