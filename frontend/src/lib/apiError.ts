import type { ApiError } from '../types/api';

export function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const data = (error as { response?: { data?: Partial<ApiError> } }).response?.data;
  if (!data) return fallback;
  if (data.fieldErrors && data.fieldErrors.length > 0) {
    return data.fieldErrors.map((f) => f.message).join(' · ');
  }
  return data.message ?? fallback;
}
