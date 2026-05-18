import { useMutation } from '@tanstack/react-query';
import { createShare } from './fetchers';

/**
 * Mints a fresh share token. No cache invalidation — once a share is
 * created, the consumer typically copies the URL and the share is
 * never re-read for that report from the same client.
 */
export function useCreateShare() {
  return useMutation({
    mutationFn: createShare,
  });
}
