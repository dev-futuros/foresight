import { useQuery } from '@tanstack/react-query';
import { getPublicShare } from './fetchers';
import { shareKeys } from './queryKeys';

/**
 * Reads a shared report by its public token. Once minted, a share
 * never changes — staleTime/gcTime Infinity and retry disabled so the
 * recipient can navigate away and back without flicker or extra
 * network calls.
 */
export function usePublicShare(token: string) {
  return useQuery({
    queryKey: shareKeys.byToken(token),
    queryFn: () => getPublicShare(token),
    enabled: !!token,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}
