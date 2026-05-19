import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from './useAuth';

/**
 * Sync the i18n locale to the signed-in user's saved language preference.
 *
 * <p>Two route families own their own locale and must be skipped here:
 *
 * <ul>
 *   <li>{@code /share/*} — public share pages drive locale from the
 *       {@code ?lang=} query param so the recipient sees the report in
 *       the language the owner picked when minting the link.</li>
 *   <li>{@code /reports/:id} (viewer) — the in-app viewer mirrors the
 *       report's active language onto i18n so UI chrome (STEEP labels,
 *       tabs, buttons) renders in the same language as the translated
 *       content. The wizard routes ({@code /reports/new} and
 *       {@code /reports/:id/edit}) are NOT skipped — those follow the
 *       user's UI preference like the rest of the app.</li>
 * </ul>
 *
 * <p>If this hook fires on those routes, the two effects fight: the
 * page wants {@code en}, this hook wants the owner's {@code es}, and
 * React enters a re-render loop. The loop is subtle for static views,
 * but every mouse-move event piles on another render — the GPU
 * compositor stops keeping up and the backdrop-filtered sticky tab-row
 * paints solid black, which is exactly the "everything goes black on
 * hover" symptom an owner reported when opening their own EN share link.
 */
export function useLanguageSync() {
  const { i18n } = useTranslation();
  const { data: user } = useCurrentUser();
  const location = useLocation();
  const isPublicShare = location.pathname.startsWith('/share/');
  const isReportViewer =
    location.pathname.startsWith('/reports/') &&
    location.pathname !== '/reports/new' &&
    !location.pathname.endsWith('/edit');

  useEffect(() => {
    if (isPublicShare || isReportViewer) return;
    if (user?.language && user.language !== i18n.language) {
      i18n.changeLanguage(user.language);
    }
  }, [user?.language, i18n, isPublicShare, isReportViewer]);
}
