import axios from 'axios';

// Session-correlation header (previously X-PostHog-Session-Id, attached
// to every API call so backend LLM events shared a session id with
// frontend pageviews) was removed alongside the PostHog client. When a
// successor analytics SDK (Mixpanel/Amplitude/Sentry replay) lands,
// re-introduce attachSessionHeader() here and wire it back into the
// fetch-based callers in features/{chat,report}/api/.

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
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // 401 means Clerk's session is no longer valid (e.g. expired and not refreshable, or
    // the user was deleted). The Clerk SDK will surface that to the UI on its own; we just
    // forward the error so React Query can mark the query as failed.
    return Promise.reject(error);
  },
);

export default api;
