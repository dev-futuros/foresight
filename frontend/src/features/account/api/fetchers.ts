/** Pure HTTP fetchers for the account feature. */
import api from '../../../lib/api';
import type { UpdateUserRequest, UserResponse } from '../../../types/api';

/** Fetches the local user profile (`/api/users/me`). */
export async function getCurrentUser() {
  const res = await api.get<UserResponse>('/users/me');
  return res.data;
}

/**
 * Updates the local profile (name / language) on the backend. Email,
 * password and MFA live in Kinde and are managed through Kinde's
 * hosted account portal — not handled from here.
 */
export async function updateProfile(data: UpdateUserRequest) {
  const res = await api.patch<UserResponse>('/users/me', data);
  return res.data;
}
