import type { ApiError } from '../types/api';

/**
 * Pull a human-readable error message out of whatever the caller caught.
 *
 * <p>Handles three shapes:
 * <ol>
 *   <li>Axios errors — read {@code error.response.data.message} and the
 *       optional field-error array.</li>
 *   <li>Plain {@link Error} instances (e.g. from {@code fetch} SSE
 *       consumers in {@code aiClient.ts}) — surface {@code error.message}
 *       so the user sees the real reason instead of the generic
 *       fallback.</li>
 *   <li>Anything else (string, primitive, null) — fall back to the
 *       caller's default copy.</li>
 * </ol>
 */
export function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;
  // Axios-style first — has the richest server-supplied detail.
  if (typeof error === 'object') {
    const data = (error as { response?: { data?: Partial<ApiError> } }).response?.data;
    if (data) {
      if (data.fieldErrors && data.fieldErrors.length > 0) {
        return data.fieldErrors.map((f) => f.message).join(' · ');
      }
      if (data.message) return data.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
