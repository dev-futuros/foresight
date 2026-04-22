import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from './useAuth';

export function useLanguageSync() {
  const { i18n } = useTranslation();
  const { data: user } = useCurrentUser();

  useEffect(() => {
    if (user?.language && user.language !== i18n.language) {
      i18n.changeLanguage(user.language);
    }
  }, [user?.language, i18n]);
}
