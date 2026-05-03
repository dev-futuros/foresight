import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { UserResponse, UpdateUserRequest } from '../types/api';

/**
 * Updates the local profile (name / language) on the backend. Email and password live in
 * Clerk and are managed through Clerk's prebuilt `<UserProfile />` component (rendered
 * inside `<UserButton />`), so they're not handled from here.
 */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateUserRequest) =>
      api.patch<UserResponse>('/users/me', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}
