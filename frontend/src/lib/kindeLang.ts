/**
 * Map the React app's i18n language to the value we send to Kinde's
 * hosted auth pages.
 *
 * Kinde supports 14 languages natively — Catalan is NOT one of them
 * (as of 2026-05). To deliver a full-Catalan auth experience anyway,
 * we hijack Kinde's Polish ("pl") language slot: in the Kinde dashboard
 * we manually fill that slot with Catalan translations for every visible
 * field on every customisable page (Sign in / Sign up / MFA / verify
 * email / errors / etc).
 *
 * This function makes the swap on the way IN to Kinde:
 *   App lang 'ca'  →  Kinde lang 'pl'  (Kinde renders Catalan-as-Polish)
 *   App lang 'es'  →  Kinde lang 'es'
 *   App lang 'en'  →  Kinde lang 'en'
 *
 * The reverse mapping (Kinde 'pl' → our chrome's 'ca') lives in the
 * foresight-kinde repo's `src/i18n.ts:resolveLang`.
 */
export function toKindeLang(appLang: string): string {
  const short = appLang.toLowerCase().slice(0, 2);
  if (short === 'ca') return 'pl';
  return short;
}
