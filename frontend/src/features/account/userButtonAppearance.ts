import { clerkVariables } from '../auth/clerkAppearance';

/**
 * Element-class map for the UserProfile modal. Kept as a standalone
 * object so it can be spread into BOTH the top-level {@code elements}
 * (catches Clerk versions that read modal-element overrides globally)
 * AND the {@code userProfile.elements} sub-scope (the documented
 * location). Duplicating the entries is cheap and survives Clerk
 * appearance-API variations across minor versions.
 */
const userProfileElements = {
  /* ─── Modal chrome (backdrop, card, root containers) ─── */
  modalBackdrop: 'cl-up-modal-backdrop',
  modalContent: 'cl-up-modal-content',
  rootBox: 'cl-up-root',
  card: 'cl-up-card',
  cardBox: 'cl-up-card-box',

  /* ─── Left rail navigation ─── */
  navbar: 'cl-up-navbar',
  navbarButtons: 'cl-up-navbar-buttons',
  navbarButton: 'cl-up-navbar-btn',

  /* ─── Right pane: header, breadcrumbs, scroll area ─── */
  pageScrollBox: 'cl-up-page-scroll',
  page: 'cl-up-page',
  header: 'cl-up-page-header',
  headerTitle: 'cl-up-page-title',
  headerSubtitle: 'cl-up-page-subtitle',
  breadcrumbs: 'cl-up-breadcrumbs',
  breadcrumbsItem: 'cl-up-breadcrumbs-item',
  breadcrumbsItemDivider: 'cl-up-breadcrumbs-divider',

  /* ─── Built-in profile sections (email, password, 2FA, …) ─── */
  profileSection: 'cl-up-section',
  profileSectionTitle: 'cl-up-section-title',
  profileSectionTitleText: 'cl-up-section-title-text',
  profileSectionSubtitle: 'cl-up-section-subtitle',
  profileSectionContent: 'cl-up-section-content',
  profileSectionPrimaryButton: 'cl-up-section-action',
  profileSectionItem: 'cl-up-section-item',

  accordionTriggerButton: 'cl-up-accordion-trigger',

  /* Avatar Upload / Remove buttons inside the "Update profile" page.
     Two distinct buttons with their own element keys — Upload is a
     secondary ghost-style button; Remove is the danger variant. */
  avatarImageActionsUpload: 'cl-up-btn-ghost',
  avatarImageActionsRemove: 'cl-up-btn-danger',

  /* User identity preview (avatar + name + email). Clerk nests the
     actual text in *Text children one level deeper than the *Identifier
     wrappers, so we map BOTH so our overrides reach the inner span
     where Clerk's default truncation styles live (see the data-variant
     attribute on `cl-userPreviewMainIdentifierText` — that's the one
     that gets cut to "R..." in the modal Profile row). */
  userPreview: 'cl-up-preview',
  userPreviewAvatarBox: 'cl-up-preview-avatar',
  userPreviewTextContainer: 'cl-up-preview-text',
  userPreviewMainIdentifier: 'cl-up-preview-name',
  userPreviewMainIdentifierText: 'cl-up-preview-name',
  userPreviewSecondaryIdentifier: 'cl-up-preview-sub',
  userPreviewSecondaryIdentifierText: 'cl-up-preview-sub',

  /* identityPreview is the parallel key Clerk uses for the same widget
     when it appears inside a profile section (vs the popover header).
     Same target classes — same look in either spot. */
  identityPreview: 'cl-up-preview',
  identityPreviewText: 'cl-up-preview-name',
  identityPreviewEditButton: 'cl-up-section-action',

  /* Form controls inside the modal. Originally reused the auth-screen
     classes (cl-input, cl-btn-primary, etc.) but those are sized for
     the 440px-wide auth card and look oversized in the modal's narrow
     right pane — chunky 13-14px padding, 14px font, full-width primary
     button. Modal-specific classes (cl-up-*) so we can size them down
     without affecting the auth screens. */
  formFieldRow: 'cl-up-field',
  formFieldLabel: 'cl-up-label',
  formFieldInput: 'cl-up-input',
  formFieldInputShowPasswordButton: 'cl-up-eye-btn',
  formFieldHintText: 'cl-up-hint',
  formFieldErrorText: 'cl-up-err-msg',
  formButtonPrimary: 'cl-up-btn-primary',
  formButtonReset: 'cl-up-btn-reset',
  /* OTP / verification code field — appears in the 2FA / add-email
     verification flow. Six segmented inputs in a row + a resend-code
     link below. Modal-specific classes so they fit the modal's
     surface palette instead of inheriting the larger auth-screen
     OTP styling. */
  otpCodeFieldInput: 'cl-up-otp-input',
  formResendCodeLink: 'cl-up-resend-link',
  badge: 'cl-badge',
  spinner: 'cl-spinner',
};

/**
 * Appearance config for Clerk's {@code <UserButton>} and the embedded
 * {@code <UserProfile>} modal it opens.
 *
 * <p><strong>Why two element maps?</strong> Clerk v6 scopes element-class
 * overrides by component. The top-level {@code elements} only applies to
 * the UserButton surface (avatar + popover dropdown). The inner
 * UserProfile modal — left rail, page header, profile sections — is a
 * separate component and reads from {@code userProfile.elements}.
 * Putting modal keys at the top level silently no-ops, which is what
 * made the modal render with Clerk defaults while the popover styled
 * correctly. Mirrors the auth-screen strategy: map every Clerk element
 * key to a CSS class we own; Clerk owns the markup and behaviour.
 *
 * <p>Variables (palette + typography) are shared with the auth screens
 * via {@link clerkVariables} so every Clerk surface in the app reads
 * from the same palette.
 */
export const userButtonAppearance = {
  variables: clerkVariables,
  elements: {
    /* ─── Avatar trigger + popover (UserButton's own surface) ─── */
    userButtonAvatarBox: 'cl-up-avatar',
    userButtonTrigger: 'cl-up-trigger',

    userButtonPopoverCard: 'cl-up-popover',
    userButtonPopoverMain: 'cl-up-popover-main',
    userButtonPopoverFooter: 'cl-up-popover-footer',
    userButtonPopoverActions: 'cl-up-popover-actions',
    userButtonPopoverActionButton: 'cl-up-popover-action',
    userButtonPopoverActionButton__signOut: 'cl-up-popover-action cl-up-popover-action--signout',
    userButtonPopoverActionButton__manageAccount: 'cl-up-popover-action',
    userButtonPopoverActionButtonIcon: 'cl-up-popover-action-ico',
    userButtonPopoverActionButtonText: 'cl-up-popover-action-text',

    /* Top-level copy of the UserProfile modal element classes. Some
       Clerk versions read modal-element overrides from the global
       elements map; others read them from userProfile.elements. We
       provide both so the modal is styled regardless of version. */
    ...userProfileElements,
  },
  userProfile: {
    // Variables override for the UserProfile modal specifically. The
    // shared clerkVariables sets colorBackground:'transparent' for the
    // auth screens (their card chrome is drawn by AuthLayout). Inside
    // a modal there's no host card behind us, so we need a real surface
    // colour — otherwise Clerk defaults the modal card to white.
    //
    // The extra colorText / colorTextSecondary / colorNeutral overrides
    // drive Clerk's internal `data-color` system through the supported
    // appearance API (rather than via CSS `[data-color="..."]`
    // selectors, which Clerk flags as structural). These values cascade
    // into the modal's inner text nodes so email/value rows read as
    // ink, not Clerk's muted default-on-dark.
    variables: {
      ...clerkVariables,
      colorBackground: '#15151c',
      colorText: '#f0ece4',
      colorTextSecondary: '#b8b3aa',
      colorNeutral: '#f0ece4',
      colorInputBackground: '#1a1a22',
      colorInputText: '#f0ece4',
    },
    elements: userProfileElements,
  },
};
