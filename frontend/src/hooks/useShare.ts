import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import api from '../lib/api';
import type { CreateShareResponse, PublicShareResponse } from '../types/api';

/**
 * Mints a fresh public share link for a report the caller owns.
 * The backend snapshots the report at this moment — subsequent edits or
 * deletes leave existing share links untouched.
 *
 * <p>When {@code language} is provided and differs from the report's
 * primary language, the backend materialises (or reuses a cached) translation
 * before snapshotting, so the share recipient sees the report in the
 * requested language. First call for a non-primary language can take
 * 10-30s while translation runs.
 */
export function useCreateShare() {
  return useMutation<
    CreateShareResponse,
    Error,
    { reportId: string; language?: 'es' | 'en' }
  >({
    mutationFn: async ({ reportId, language }) => {
      const res = await api.post<CreateShareResponse>(
        `/reports/${reportId}/share`,
        null,
        language ? { params: { language } } : undefined,
      );
      return res.data;
    },
  });
}

/**
 * Reads a shared report by its public token. Used by the unauthenticated
 * `/share/:token` route, so this query bypasses the JWT-bearing axios instance
 * and uses a plain axios call against the same `/api` prefix.
 *
 * The auth-bearing instance would still work (the endpoint is allow-listed at
 * the security layer), but using plain axios here keeps it explicit that the
 * call works without any session.
 */
export function usePublicShare(token: string) {
  return useQuery<PublicShareResponse>({
    queryKey: ['publicShare', token],
    queryFn: async () => {
      const res = await axios.get<PublicShareResponse>(`/api/public/share/${token}`);
      return res.data;
    },
    enabled: !!token,
    // Once a share exists it never changes — there's no value in revalidating
    // on focus or reconnect, and a stale time of "infinity" prevents flicker
    // if the recipient navigates away and back.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}
