import { useEffect } from 'react';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { useTranslation } from 'react-i18next';

/**
 * Route guard that defers to Kinde for the auth check.
 *
 * Three states:
 *   - Kinde hasn't finished hydrating: render a loading screen so we don't
 *     flicker through anything visible while a valid session is being
 *     restored on a hard reload.
 *   - Hydrated and signed-in: render the children.
 *   - Hydrated and signed-out: trigger Kinde's hosted login flow directly.
 *
 * <p><b>Language forwarding (option B in the language-routing discussion):</b>
 * If the URL has `?lang=`, pass it through to Kinde's `login()` so the
 * hosted auth page renders in the requested language. This is the ONLY
 * place we read the URL param; it's not threaded into i18n. Without this
 * hop, Kinde never sees the language because it only honours `lang` when
 * supplied to the OAuth flow start — see Kinde's docs on language
 * detection priority.
 *
 * <p>Catalan is hijacked onto Kinde's Polish slot (`pl`) because Kinde
 * doesn't natively support `ca` — see `foresight-kinde/src/i18n.ts` for
 * the reverse mapping that picks Catalan back up on the Kinde side.
 */
export default function ProtectedRoute({ children }: Readonly<{ children: React.ReactNode }>) {
  const { t } = useTranslation();
  const { isLoading, isAuthenticated, login } = useKindeAuth();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    const urlLang = new URLSearchParams(globalThis.location.search).get('lang');
    const kindeLang = urlLang === 'ca' ? 'pl' : urlLang;
    void login(kindeLang ? { lang: kindeLang } : undefined);
  }, [isLoading, isAuthenticated, login]);

  if (isLoading || !isAuthenticated) {
    return <div className="loading-screen">{t('common.loading')}</div>;
  }

  return <>{children}</>;
}
