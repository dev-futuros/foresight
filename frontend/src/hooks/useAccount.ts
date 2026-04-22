import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { UserResponse, UpdateUserRequest, ChangePasswordRequest } from '../types/api';

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateUserRequest) =>
      api.patch<UserResponse>('/users/me', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: ChangePasswordRequest) =>
      api.post<void>('/auth/change-password', data),
  });
}
