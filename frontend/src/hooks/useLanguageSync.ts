import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from './useAuth';

/**
 * Sync the i18n locale to the signed-in user's saved language preference.
 *
 * <p>Public share pages own their own locale (driven by the {@code ?lang=}
 * query param so the recipient sees the report in the language the owner
 * picked when minting the link). If this hook also fires there, the two
 * effects fight: the share page wants {@code en}, this hook wants the
 * owner's {@code es}, and React enters a re-render loop. The loop is
 * subtle for static views, but every mouse-move event piles on another
 * render — the GPU compositor stops keeping up and the backdrop-filtered
 * sticky tab-row paints solid black, which is exactly the "everything
 * goes black on hover" symptom an owner reported when opening their own
 * EN share link. Skipping the sync on {@code /share/*} routes lets
 * {@code PublicSharePage}'s effect own the locale without contention.
 */
export function useLanguageSync() {
  const { i18n } = useTranslation();
  const { data: user } = useCurrentUser();
  const location = useLocation();
  const isPublicShare = location.pathname.startsWith('/share/');

  useEffect(() => {
    if (isPublicShare) return;
    if (user?.language && user.language !== i18n.language) {
      i18n.changeLanguage(user.language);
    }
  }, [user?.language, i18n, isPublicShare]);
}
