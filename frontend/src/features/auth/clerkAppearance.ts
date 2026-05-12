/**
 * Appearance config for Clerk's <SignIn /> and <SignUp /> components.
 *
 * Strategy: Clerk renders the form (email, password, OAuth, verification, etc.)
 * but our own AuthLayout provides the card chrome, brand header, eyebrow, title,
 * lede, consent line, and footer. We hide Clerk's built-in header and reset its
 * card chrome so the form blends into our card. The "switch between sign-in and
 * sign-up" link in Clerk's footer stays visible (re-styled).
 *
 * The runtime shape is `{ variables, elements }` — passed through verbatim to
 * Clerk. Type intentionally omitted because @clerk/react v6 doesn't re-export
 * an `Appearance` type and we don't want a fragile dep on @clerk/types.
 *
 * Element classes (cl-*) are styled in features/auth/auth.css.
 */
/**
 * Shared palette + typography tokens for every Clerk component we mount
 * (SignIn / SignUp / UserButton / UserProfile). Lifted into its own
 * export so the user-profile modal in {@code AppUserButton} can reuse the
 * exact same colours and fonts as the auth screens — keeps the visual
 * language consistent across the gateway and in-app surfaces.
 */
export const clerkVariables = {
  colorPrimary: '#d4a853',
  colorBackground: 'transparent',
  colorText: '#f0ece4',
  colorTextSecondary: '#b8b3aa',
  colorInputBackground: '#1a1a22',
  colorInputText: '#f0ece4',
  colorDanger: '#fb8e8e',
  colorSuccess: '#6ee7b7',
  colorWarning: '#fbb77b',
  fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
  fontFamilyButtons: "'DM Sans', system-ui, -apple-system, sans-serif",
  fontSize: '14px',
  borderRadius: '10px',
};

export const clerkAppearance = {
  variables: clerkVariables,
  elements: {
    rootBox: 'cl-root',
    card: 'cl-card',
    cardBox: 'cl-card-box',
    header: 'cl-header-hidden',
    main: 'cl-main',
    form: 'cl-form',
    formButtonRow: 'cl-btn-row',
    formFieldRow: 'cl-field',
    formFieldLabel: 'cl-label',
    formFieldInput: 'cl-input',
    formFieldInputShowPasswordButton: 'cl-eye-btn',
    formFieldHintText: 'cl-hint',
    formFieldErrorText: 'cl-err-msg',
    formButtonPrimary: 'cl-btn-primary',
    formButtonReset: 'cl-btn-reset',
    footer: 'cl-footer',
    footerAction: 'cl-footer-action',
    footerActionText: 'cl-footer-action-text',
    footerActionLink: 'cl-footer-action-link',
    dividerRow: 'cl-divider',
    dividerLine: 'cl-divider-line',
    dividerText: 'cl-divider-text',
    socialButtonsBlockButton: 'cl-social-btn',
    socialButtonsBlockButtonText: 'cl-social-btn-text',
    socialButtonsBlockButtonArrow: 'cl-social-btn-arrow',
    socialButtonsIconButton: 'cl-social-icon-btn',
    socialButtonsProviderIcon: 'cl-social-provider-icon',
    identityPreview: 'cl-identity-preview',
    identityPreviewText: 'cl-identity-preview-text',
    identityPreviewEditButton: 'cl-identity-preview-edit',
    formResendCodeLink: 'cl-resend-link',
    otpCodeFieldInput: 'cl-otp-input',
    alternativeMethodsBlockButton: 'cl-alt-method-btn',
    formHeaderTitle: 'cl-form-header-title',
    formHeaderSubtitle: 'cl-form-header-subtitle',
    badge: 'cl-badge',
    spinner: 'cl-spinner',
  },
};
