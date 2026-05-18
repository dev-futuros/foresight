/**
 * Typed React Query key factory for the report feature.
 *
 * <p>Per TkDodo (https://tkdodo.eu/blog/effective-react-query-keys): all
 * keys live in a single factory so the keys used for fetching, caching,
 * and invalidation never drift. Always use the const-asserted arrays —
 * literal-tuple typing is what lets `invalidateQueries({ queryKey: ...})`
 * narrow at the call site.
 *
 * <p>Hierarchy:
 *   reports                              — all report-scoped data
 *     ├── list                           — list queries (paginated)
 *     │     └── { page, size }           — one entry per filter set
 *     └── detail                         — single-report queries
 *           └── id                       — the report by id
 *                 └── translation        — per-language translation
 *                       └── lang
 *
 * <p>Invalidating `reports` drops everything report-related; invalidating
 * `reports.detail(id)` drops just that report's detail entry and any
 * nested keys (translations under it) for free.
 */
export const reportKeys = {
  all: ['reports'] as const,

  lists: () => [...reportKeys.all, 'list'] as const,
  list: (params: { page: number; size: number }) => [...reportKeys.lists(), params] as const,

  details: () => [...reportKeys.all, 'detail'] as const,
  detail: (id: string) => [...reportKeys.details(), id] as const,

  translation: (id: string, language: string) =>
    [...reportKeys.detail(id), 'translation', language] as const,
};
