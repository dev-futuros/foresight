/**
 * Avatar trigger + dropdown menu in the topbar. Replaces the previous bare
 * "open AccountModal" icon button so the affordance matches what users expect
 * from every other modern SaaS top bar (Clerk-style {@code <UserButton />},
 * Linear's account menu, etc.).
 *
 * <p>Two items, always:
 * <ol>
 *   <li><b>Profile</b> — opens the {@link AccountModal} via the {@code
 *       onProfileClick} callback (the modal itself lives in {@code AppShell}).</li>
 *   <li><b>Logout</b> — calls {@link useLogout}, which delegates to Kinde's
 *       hosted logout flow.</li>
 * </ol>
 *
 * <p>Avatar source priority follows {@link Avatar}: Kinde's {@code picture} →
 * initials of the local display name → generic user icon. The name comes from
 * the backend ({@code useCurrentUser}) rather than the Kinde JWT claim because
 * the backend is the authoritative store after a {@code PATCH /me} — using the
 * Kinde claim would lag by one session.
 *
 * <p>Dismissal: clicking outside the trigger or the menu, or pressing Escape,
 * closes the menu. Trigger's focus is preserved so keyboard users return to a
 * predictable location after dismissing.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentUser, useLogout } from '../../hooks/useAuth';
import Avatar from './Avatar';
import './accountMenu.css';

interface Props {
  /**
   * Callback fired when the user picks "Profile". The parent ({@code TopBar})
   * forwards this to {@code AppShell}, which owns the modal's open state. Kept
   * as a prop so this component stays modal-agnostic — it just knows "the user
   * wants their profile open" and lets the shell decide how to show it.
   */
  onProfileClick: () => void;
}

export default function AccountMenu({ onProfileClick }: Readonly<Props>) {
  const { t } = useTranslation();
  const { data: backendUser } = useCurrentUser();
  const logout = useLogout();

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Avatar source comes entirely from the backend's composed UserResponse — picture
  // mirrors Kinde's stock `picture`, name composes Kinde's first/last. The frontend
  // never reads Kinde claims directly for profile data; that's the backend's job.
  const picture = backendUser?.picture ?? null;
  const displayName = backendUser?.name ?? null;

  // Click-outside + ESC dismiss. Only registered while open to avoid paying
  // for global listeners on every render. `pointerdown` (rather than `click`)
  // catches the dismiss before the new target's click handler fires — matches
  // the dismiss behaviour of native macOS / Windows menus.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handleProfile() {
    setOpen(false);
    onProfileClick();
  }

  function handleLogout() {
    setOpen(false);
    void logout();
  }

  return (
    <div className="account-menu">
      <button
        ref={triggerRef}
        type="button"
        className="account-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('nav.account')}
        data-tooltip={open ? undefined : t('nav.account')}
        data-tooltip-pos="below"
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar src={picture} name={displayName} size={32} />
      </button>
      {open && (
        <div ref={menuRef} role="menu" className="account-menu-popover">
          <button
            type="button"
            role="menuitem"
            className="account-menu-item"
            onClick={handleProfile}
          >
            <svg viewBox="0 0 24 24" className="account-menu-item-ico" aria-hidden>
              <use href="#i-user" />
            </svg>
            <span>{t('nav.accountMenu.profile')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="account-menu-item account-menu-item--danger"
            onClick={handleLogout}
          >
            <svg viewBox="0 0 24 24" className="account-menu-item-ico" aria-hidden>
              <use href="#i-signout" />
            </svg>
            <span>{t('nav.accountMenu.logout')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
