import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from './useAuth';

/**
 * Sync the i18n locale to the signed-in user's saved language preference —
 * but only when there's no stronger client-side signal already in play.
 *
 * <p>Priority order (high → low):
 * <ol>
 *   <li>{@code ?lang=} URL query param</li>
 *   <li>{@code futuros_lang} cookie scoped to {@code .futuros.io}</li>
 *   <li>This hook → {@code user.language} from the database</li>
 *   <li>i18next-browser-languagedetector → localStorage / navigator / fallback</li>
 * </ol>
 *
 * <p>Without the URL/cookie short-circuit, a user landing on
 * {@code dev.futuros.io?lang=es} with an existing {@code user.language='en'}
 * would see Spanish for a frame and then flip back to English — the URL
 * param is dead on arrival. Skipping the override when an explicit client
 * signal is present makes the URL param actually do what it says.
 *
 * <p>Public share pages own their own locale (driven by their own
 * {@code ?lang=} query param so the recipient sees the report in the
 * language the owner picked when minting the link). If this hook also
 * fires there, the two effects fight: the share page wants {@code en},
 * this hook wants the owner's {@code es}, and React enters a re-render
 * loop. Skipping the sync on {@code /share/*} routes lets
 * {@code PublicSharePage}'s effect own the locale without contention.
 */
export function useLanguageSync() {
  const { i18n } = useTranslation();
  const { data: user } = useCurrentUser();
  const location = useLocation();
  const isPublicShare = location.pathname.startsWith('/share/');

  useEffect(() => {
    if (isPublicShare) return;
    if (!user?.language) return;
    if (user.language === i18n.language) return;

    // Defer to an explicit client-side language signal if one is present.
    // Both signals are checked at hook fire time (not just mount) so that
    // a navigation that introduces a new ?lang= doesn't get clobbered.
    const urlLang = new URLSearchParams(globalThis.location.search).get('lang');
    const cookieLang = document.cookie
      .split('; ')
      .find((c) => c.startsWith('futuros_lang='))
      ?.split('=')[1];
    if (urlLang || cookieLang) return;

    // No explicit signal — sync to the user's stored cross-device preference.
    i18n.changeLanguage(user.language);
  }, [user?.language, i18n, isPublicShare]);
}
