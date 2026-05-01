import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { setToken } from '../lib/api';
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  UserResponse,
} from '../types/api';

export function useCurrentUser() {
  return useQuery<UserResponse>({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.get<UserResponse>('/users/me');
      return res.data;
    },
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: LoginRequest) => {
      const res = await api.post<AuthResponse>('/auth/login', body);
      return res.data;
    },
    onSuccess: (data) => {
      setToken(data.accessToken);
      qc.setQueryData(['me'], data.user);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: RegisterRequest) => {
      const res = await api.post<AuthResponse>('/auth/register', body);
      return res.data;
    },
    onSuccess: (data) => {
      setToken(data.accessToken);
      qc.setQueryData(['me'], data.user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return () => {
    setToken(null);
    qc.clear();
    window.location.href = '/login';
  };
}
