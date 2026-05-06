/**
 * Clerk localization overrides for SignIn / SignUp.
 *
 * Why this file exists: Clerk renders its own internal text ("Continue",
 * "Email address", "OR", "Don't have an account? Sign up", etc.). The
 * `@clerk/localizations` package would handle this, but keeping the strings
 * inline here avoids a new npm dep + Docker volume rebuild for what is a
 * short list of overrides.
 *
 * Type intentionally omitted because @clerk/react v6 doesn't re-export the
 * `LocalizationResource` shape and we don't want a fragile dep on
 * @clerk/types. Excess keys are silently ignored by Clerk; missing keys
 * fall through to its default English copy.
 */

type Mode = 'signin' | 'signup';

/** Returns a Clerk localization object for the given language + mode. */
export function clerkLocalization(lang: 'es' | 'en', mode: Mode) {
  return lang === 'en' ? buildEN(mode) : buildES(mode);
}

/* ─────────────────────────────────────────────────────────────
   Spanish
   ───────────────────────────────────────────────────────────── */
function buildES(mode: Mode) {
  // The big primary button text. Clerk uses one key globally even though it
  // renders on several steps (start, password, verify…). Per the user's
  // request the login button should say "Acceder" and the signup button
  // "Crear cuenta" — semantically slightly off on the email-only first step
  // (where it actually means "continue") but matches the page intent.
  const formButtonPrimary = mode === 'signin' ? 'Acceder' : 'Crear cuenta';

  return {
    socialButtonsBlockButton: 'Continuar con {{provider|titleize}}',
    dividerText: 'o',
    formButtonPrimary,
    formButtonReset: 'Cancelar',
    formFieldLabel__emailAddress: 'Correo electrónico',
    formFieldLabel__password: 'Contraseña',
    formFieldLabel__confirmPassword: 'Confirmar contraseña',
    formFieldLabel__firstName: 'Nombre',
    formFieldLabel__lastName: 'Apellidos',
    formFieldInputPlaceholder__emailAddress: 'tu@correo.com',
    formFieldInputPlaceholder__password: 'Tu contraseña',
    formFieldAction__forgotPassword: '¿Has olvidado tu contraseña?',
    signIn: {
      start: {
        title: 'Iniciar sesión',
        subtitle: 'para continuar a Futuros',
        actionText: '¿No tienes cuenta?',
        actionLink: 'Crear cuenta',
        actionLink__use_email: 'Usa tu correo',
        actionLink__use_phone: 'Usa tu teléfono',
      },
      password: {
        title: 'Introduce tu contraseña',
        subtitle: 'para continuar a Futuros',
        actionLink: 'Usa otro método',
      },
      forgotPassword: {
        title: '¿Has olvidado tu contraseña?',
        subtitle: 'Te enviaremos un correo para restablecerla.',
        formButtonPrimary: 'Enviar enlace',
      },
      forgotPasswordAlternativeMethods: {
        title: 'Restablecer contraseña',
        actionLink: 'Volver a iniciar sesión',
      },
    },
    signUp: {
      start: {
        title: 'Crear cuenta',
        subtitle: 'para empezar a usar Futuros',
        actionText: '¿Ya tienes cuenta?',
        actionLink: 'Iniciar sesión',
      },
      emailLink: {
        title: 'Verifica tu correo',
        subtitle: 'Te enviamos un enlace de verificación.',
      },
      emailCode: {
        title: 'Verifica tu correo',
        subtitle: 'Introduce el código que te enviamos.',
        formTitle: 'Código de verificación',
      },
    },
    footerPageLink__help: 'Ayuda',
    footerPageLink__privacy: 'Privacidad',
    footerPageLink__terms: 'Términos',
  } as const;
}

/* ─────────────────────────────────────────────────────────────
   English (overrides only the strings the user flagged + a few
   adjacent ones; everything else falls back to Clerk's defaults)
   ───────────────────────────────────────────────────────────── */
function buildEN(mode: Mode) {
  const formButtonPrimary = mode === 'signin' ? 'Sign in' : 'Sign up';

  return {
    dividerText: 'or',
    formButtonPrimary,
    formFieldLabel__emailAddress: 'Email',
    formFieldLabel__password: 'Password',
    formFieldInputPlaceholder__emailAddress: 'you@example.com',
    formFieldInputPlaceholder__password: 'Your password',
    signIn: {
      start: {
        title: 'Sign in',
        subtitle: 'to continue to Futuros',
        actionText: "Don't have an account?",
        actionLink: 'Sign up',
      },
      password: {
        title: 'Enter your password',
        subtitle: 'to continue to Futuros',
      },
      forgotPassword: {
        title: 'Forgot your password?',
        subtitle: "We'll email you a reset link.",
        formButtonPrimary: 'Send link',
      },
    },
    signUp: {
      start: {
        title: 'Create account',
        subtitle: 'to start using Futuros',
        actionText: 'Already have an account?',
        actionLink: 'Sign in',
      },
    },
  } as const;
}
