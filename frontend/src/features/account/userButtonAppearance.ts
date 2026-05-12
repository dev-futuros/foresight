import { clerkVariables } from '../auth/clerkAppearance';

/**
 * Appearance config for Clerk's {@code <UserButton>} and the embedded
 * {@code <UserProfile>} modal it opens. Mirrors the auth-screen strategy:
 * map every Clerk element key to a CSS class we own
 * ({@code cl-up-*} for UserProfile-specific elements; the {@code cl-*}
 * classes carry over from auth where the elements overlap — form fields
 * and primary buttons are the same control everywhere).
 *
 * Variables (palette + typography) are shared with the auth screens via
 * {@link clerkVariables} so the modal feels like the same product.
 */
export const userButtonAppearance = {
  variables: clerkVariables,
  elements: {
    /* Avatar trigger in the topbar. Size is set per-instance via the
       Props.size knob in AppUserButton; here we just hook the class so
       css can add a subtle gold ring on hover. */
    userButtonAvatarBox: 'cl-up-avatar',
    userButtonTrigger: 'cl-up-trigger',

    /* Dropdown that appears when the avatar is clicked. */
    userButtonPopoverCard: 'cl-up-popover',
    userButtonPopoverMain: 'cl-up-popover-main',
    userButtonPopoverFooter: 'cl-up-popover-footer',
    userButtonPopoverActions: 'cl-up-popover-actions',
    userButtonPopoverActionButton: 'cl-up-popover-action',
    userButtonPopoverActionButton__signOut: 'cl-up-popover-action cl-up-popover-action--signout',
    userButtonPopoverActionButton__manageAccount: 'cl-up-popover-action',
    userButtonPopoverActionButtonIcon: 'cl-up-popover-action-ico',
    userButtonPopoverActionButtonText: 'cl-up-popover-action-text',

    /* User identity preview (avatar + name + email) shown in the popover
       and the modal header. */
    userPreview: 'cl-up-preview',
    userPreviewAvatarBox: 'cl-up-preview-avatar',
    userPreviewMainIdentifier: 'cl-up-preview-name',
    userPreviewSecondaryIdentifier: 'cl-up-preview-sub',
    userPreviewTextContainer: 'cl-up-preview-text',

    /* Modal chrome — backdrop, scroll container, card. */
    modalBackdrop: 'cl-up-modal-backdrop',
    modalContent: 'cl-up-modal-content',
    rootBox: 'cl-up-root',
    card: 'cl-up-card',
    cardBox: 'cl-up-card-box',

    /* Left rail navigation. */
    navbar: 'cl-up-navbar',
    navbarButtons: 'cl-up-navbar-buttons',
    navbarButton: 'cl-up-navbar-btn',

    /* Right pane — header, content scroller, breadcrumbs. */
    pageScrollBox: 'cl-up-page-scroll',
    page: 'cl-up-page',
    header: 'cl-up-page-header',
    headerTitle: 'cl-up-page-title',
    headerSubtitle: 'cl-up-page-subtitle',
    breadcrumbs: 'cl-up-breadcrumbs',
    breadcrumbsItem: 'cl-up-breadcrumbs-item',
    breadcrumbsItemDivider: 'cl-up-breadcrumbs-divider',

    /* Built-in profile sections (email, password, 2FA, etc.). */
    profileSection: 'cl-up-section',
    profileSectionTitle: 'cl-up-section-title',
    profileSectionTitleText: 'cl-up-section-title-text',
    profileSectionSubtitle: 'cl-up-section-subtitle',
    profileSectionContent: 'cl-up-section-content',
    profileSectionPrimaryButton: 'cl-up-section-action',
    profileSectionItem: 'cl-up-section-item',

    accordionTriggerButton: 'cl-up-accordion-trigger',

    /* Form controls inside the modal — same components as auth, same
       classes. Anything not listed here inherits from the cl-* rules
       already shipped in features/auth/auth.css. */
    formFieldRow: 'cl-field',
    formFieldLabel: 'cl-label',
    formFieldInput: 'cl-input',
    formFieldInputShowPasswordButton: 'cl-eye-btn',
    formFieldHintText: 'cl-hint',
    formFieldErrorText: 'cl-err-msg',
    formButtonPrimary: 'cl-btn-primary',
    formButtonReset: 'cl-btn-reset',
    badge: 'cl-badge',
    spinner: 'cl-spinner',
  },
};
