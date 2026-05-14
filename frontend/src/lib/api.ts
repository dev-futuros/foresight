import axios from 'axios';

/**
 * Header name the backend reads to populate {@code $ai_session_id} on
 * {@code $ai_generation} events. Sourcing the value from the browser's
 * PostHog session id (via {@code window.posthog.get_session_id()}) means
 * backend LLM events and frontend pageviews/UI events stitch into the
 * same session in PostHog — the LLM Analytics dashboard's "session"
 * dimension lights up as a result.
 *
 * <p>Returns an empty string when PostHog isn't loaded (e.g. analytics
 * disabled in this build, or the SDK hasn't fetched array.js yet). The
 * backend treats absent / empty as "no session" and just omits the
 * {@code $ai_session_id} property.
 */
const PH_SESSION_HEADER = 'X-PostHog-Session-Id';
function readPostHogSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  const ph = window.posthog as { get_session_id?: () => string | null } | undefined;
  if (!ph || typeof ph.get_session_id !== 'function') return null;
  try {
    return ph.get_session_id();
  } catch {
    return null;
  }
}

/**
 * Helper for fetch-based callers (SSE streaming endpoints in
 * {@code aiClient.ts}) that need to attach the same PostHog session header
 * as the axios instance. Mutates {@code headers} in place and returns it
 * so the call site can chain.
 */
export function attachPostHogSession(headers: Record<string, string>): Record<string, string> {
  const sid = readPostHogSessionId();
  if (sid) headers[PH_SESSION_HEADER] = sid;
  return headers;
}

/**
 * Async getter for the current session's bearer token. Wired by `<AuthBridge>` (inside
 * `<ClerkProvider>`) at app startup so the rest of the codebase can keep using a single
 * pre-configured axios instance without each call having to plumb a token through manually.
 *
 * Stays `null` until Clerk has hydrated; in that window requests fire without an
 * Authorization header — which is the right behavior for the brief moment between mount
 * and the first time `getToken()` resolves.
 */
let tokenGetter: (() => Promise<string | null>) | null = null;

export function setTokenGetter(getter: (() => Promise<string | null>) | null) {
  tokenGetter = getter;
}

/**
 * Resolves the current session's bearer token via the registered getter,
 * for callers that need to issue fetch() requests directly (e.g. SSE
 * streaming consumers where axios isn't a good fit). Returns null in
 * the brief window between mount and the first Clerk hydration; the
 * fetch caller should simply omit the Authorization header in that case.
 */
export async function getAuthToken(): Promise<string | null> {
  return tokenGetter ? tokenGetter() : null;
}

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  if (tokenGetter) {
    const token = await tokenGetter();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  const sid = readPostHogSessionId();
  if (sid) {
    config.headers[PH_SESSION_HEADER] = sid;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // 401 means Clerk's session is no longer valid (e.g. expired and not refreshable, or
    // the user was deleted). The Clerk SDK will surface that to the UI on its own; we just
    // forward the error so React Query can mark the query as failed.
    return Promise.reject(error);
  }
);

export default api;
