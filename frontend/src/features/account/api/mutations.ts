import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateProfile } from './fetchers';
import { accountKeys } from './queryKeys';

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.me() }),
  });
}
