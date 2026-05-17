// Catalan locale — scoped to the `auth` namespace only for now.
// Every other key falls back to Spanish (fallbackLng: 'es' in i18n/index.ts)
// because Catalan support across the whole app is a separate, larger effort.
//
// Today the only React route that uses these keys is /logged-out. Sign-in
// and sign-up redirect directly to the Kinde-hosted pages, which have
// their own localisation pipeline in the foresight-kinde repo.
const ca = {
  auth: {
    shell: {
      brandTag: 'Estratègia de Foresight',
      consent: 'En accedir, acceptes la nostra <a href="/privacy">Política de Privacitat i Condicions</a>.',
    },
    loggedOut: {
      eyebrow: 'Sessió tancada',
      title: 'Has tancat la sessió',
      description: 'La teva sessió s’ha tancat de manera segura. Torna a iniciar sessió quan vulguis continuar mapant el teu horitzó estratègic.',
      signInAgain: 'Tornar a iniciar sessió →',
    },
  },
} as const;

export default ca;
