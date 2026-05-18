/**
 * Typed React Query key factory for the examples feature. Same pattern
 * as features/report/api/queryKeys.ts — see that file for the rationale.
 */
export const exampleKeys = {
  all: ['examples'] as const,

  lists: () => [...exampleKeys.all, 'list'] as const,
  list: () => [...exampleKeys.lists()] as const,

  details: () => [...exampleKeys.all, 'detail'] as const,
  detail: (id: string) => [...exampleKeys.details(), id] as const,

  translation: (id: string, language: string) =>
    [...exampleKeys.detail(id), 'translation', language] as const,
};
