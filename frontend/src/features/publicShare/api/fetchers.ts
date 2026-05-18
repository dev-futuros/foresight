import type { LanguageCode } from '../../../i18n/languages';
/**
 * Pure HTTP fetchers for the public-share feature. The auth-bearing
 * axios instance from lib/api is fine for createShare (caller is
 * authenticated). getPublicShare uses plain axios so the token-resolve
 * endpoint stays explicitly anonymous.
 */
import axios from 'axios';
import api from '../../../lib/api';
import type { CreateShareResponse, PublicShareResponse } from '../../../types/api';

/**
 * Mints a fresh public share link from either a report the caller owns
 * or a global example. The backend snapshots the source at this moment
 * — subsequent edits or deletes on the source leave existing share
 * links untouched.
 *
 * <p>When `language` is provided and differs from the source's primary
 * language, the backend materialises (or reuses a cached) translation
 * before snapshotting. For reports, the first call for a non-primary
 * language can take 10–30s while translation runs; for examples it
 * returns instantly when a DEV has already pre-translated, and refuses
 * with HTTP 403 when the language hasn't been materialised yet (only
 * DEVs can trigger example translations).
 */
export async function createShare(args: {
  reportId: string;
  language?: LanguageCode;
  /** Languages to bake into the share snapshot. When set, the backend
   *  snapshots only these (plus an implicit fallback to the chosen
   *  `language` as the share's primary). When omitted, the backend
   *  defaults to "every language the source has". */
  languages?: LanguageCode[];
  kind?: 'report' | 'example';
}) {
  const { reportId, language, languages, kind = 'report' } = args;
  const base = kind === 'example' ? 'examples' : 'reports';
  // Compose query params explicitly so omitted fields don't end up as
  // `language=undefined` in the URL.
  const params: Record<string, string> = {};
  if (language) params.language = language;
  if (languages && languages.length > 0) {
    // Backend's ShareController parses this as a comma-separated list.
    params.languages = languages.join(',');
  }
  const res = await api.post<CreateShareResponse>(
    `/${base}/${reportId}/share`,
    null,
    Object.keys(params).length > 0 ? { params } : undefined,
  );
  return res.data;
}

/**
 * Reads a shared report by its public token. Bypasses the JWT-bearing
 * axios instance and uses a plain axios call against the same `/api`
 * prefix — the endpoint is allow-listed at the security layer, but
 * using plain axios here keeps it explicit that the call works without
 * any session.
 */
export async function getPublicShare(token: string) {
  const res = await axios.get<PublicShareResponse>(`/api/public/share/${token}`);
  return res.data;
}
