import { useTranslation } from 'react-i18next';
import type { FallbackProps } from 'react-error-boundary';

/**
 * Render a rendering crash inside an <ErrorBoundary>. The "Try again" button
 * resets the boundary (re-mounts the children); the "Back to start" button
 * does a hard navigation to /reports/new in case the boundary's state is
 * itself corrupted (e.g. router context vanished).
 *
 * The component itself stays dependency-free apart from react-i18next so it
 * survives crashes in feature code — it doesn't reach into the app's query
 * client, Kinde provider, or any other context that might be the thing
 * that just crashed.
 */
export default function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
        gap: '1rem',
      }}
    >
      <h1 style={{ margin: 0 }}>{t('errorBoundary.title')}</h1>
      <p style={{ margin: 0, maxWidth: '36rem', opacity: 0.85 }}>{t('errorBoundary.body')}</p>
      {/* The raw message helps support figure out what crashed without
          asking the user to dig in DevTools. Only the .message is shown
          — the stack is logged to the console by react-error-boundary. */}
      {error instanceof Error && error.message ? (
        <pre
          style={{
            margin: 0,
            padding: '0.75rem 1rem',
            background: 'rgba(0,0,0,0.05)',
            borderRadius: 6,
            maxWidth: '40rem',
            overflowX: 'auto',
            fontSize: '0.85rem',
            whiteSpace: 'pre-wrap',
          }}
        >
          {error.message}
        </pre>
      ) : null}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
        <button type="button" onClick={resetErrorBoundary}>
          {t('errorBoundary.retry')}
        </button>
        <button
          type="button"
          onClick={() => {
            globalThis.location.href = '/reports/new';
          }}
        >
          {t('errorBoundary.reset')}
        </button>
      </div>
    </div>
  );
}
