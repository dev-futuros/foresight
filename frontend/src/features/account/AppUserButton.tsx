import { UserButton } from '@clerk/react';
import { useTranslation } from 'react-i18next';
import ClerkPreferencesPage from './ClerkPreferencesPage';
import { userButtonAppearance } from './userButtonAppearance';
// Styles for both the popover (cl-up-*) and the in-modal Preferences
// page body (.clerk-custom-page). Imported here because this is the
// single entry point for everything Clerk-modal-related in the app —
// the old AccountPage that used to import this file is gone.
import './account.css';

interface Props {
  /** Pixel size of the avatar. Topbar uses ~28; forwarded to Clerk via
   *  the avatarBox appearance slot. */
  size?: number;
}

/**
 * Clerk {@code <UserButton>} pre-wired with the app's custom Preferences
 * page. Single source of truth for the avatar menu — the topbar mounts
 * one instance, and Clerk's built-in modal handles account / security /
 * sign out alongside our Preferences tab.
 */
export default function AppUserButton({ size = 28 }: Props) {
  const { t } = useTranslation();

  return (
    <UserButton
      appearance={{
        ...userButtonAppearance,
        elements: {
          ...userButtonAppearance.elements,
          // Avatar box sizing is per-instance — merged on top of the
          // shared element-class map so the topbar can render a tight
          // 28px avatar while a future hero use could pass 120px.
          avatarBox: { width: size, height: size },
        },
      }}
    >
      {/* Preferences custom page — Clerk renders this as a tab inside the
          UserProfile modal's left rail. Body is our React tree so app
          hooks (i18n, query client, auth) all resolve. */}
      <UserButton.UserProfilePage
        label={t('account.preferences.title')}
        url="preferences"
        labelIcon={
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.55V21a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1.03H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.55V3a2 2 0 0 1 4 0v.09c0 .67.39 1.28 1.03 1.55a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.27.64.88 1.03 1.55 1.03H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1.03z" />
          </svg>
        }
      >
        <ClerkPreferencesPage />
      </UserButton.UserProfilePage>
    </UserButton>
  );
}
