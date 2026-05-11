import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import api from '../lib/api';
import type { CreateShareResponse, PublicShareResponse } from '../types/api';

/**
 * Mints a fresh public share link for a report the caller owns.
 * The backend snapshots the report at this moment — subsequent edits or deletes
 * leave existing share links untouched.
 */
export function useCreateShare() {
  return useMutation({
    mutationFn: async (reportId: string) => {
      const res = await api.post<CreateShareResponse>(`/reports/${reportId}/share`);
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
