import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vitest/config';

// Sentry source-map upload runs only when SENTRY_AUTH_TOKEN is present
// at build time. Local `npm run build` works without it (the plugin
// no-ops and prints a notice); CI (Railway) sets the secret so prod
// builds upload the maps to Sentry. SENTRY_ORG / SENTRY_PROJECT default
// to the values baked here — override via env if those ever change.
const sentryPlugin = process.env.SENTRY_AUTH_TOKEN
  ? sentryVitePlugin({
      org: process.env.SENTRY_ORG ?? 'futuros',
      project: process.env.SENTRY_PROJECT ?? 'futuros-fe',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    })
  : null;

export default defineConfig({
  // build.sourcemap: 'hidden' generates source maps for upload to
  // Sentry but does NOT reference them from the bundle output — i.e.
  // they're available locally in dist/ for the plugin to upload and
  // then can be stripped before shipping to users. Sentry symbolicates
  // stack traces server-side using the uploaded maps, so production
  // users never see (and never download) the originals.
  build: { sourcemap: 'hidden' },
  plugins: [react(), ...(sentryPlugin ? [sentryPlugin] : [])],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:8080',
        changeOrigin: true,
        // Disable upstream connection pooling. With pooling on, an
        // active SSE pins one socket open for the full stream
        // duration; subsequent requests over the same pooled
        // connection wait until that socket frees up — which mostly
        // looks like "the second translation never starts". `agent:
        // false` forces a fresh upstream socket per request.
        agent: false,
      },
    },
  },
  // Settings used by {@code vite preview} (which serves the built
  // {@code dist/} output). Without an explicit host the preview server
  // binds to 127.0.0.1 only, so port mappings from the container to the
  // host can't reach it. The proxy mirrors the dev server's so the
  // built SPA can still call the backend at {@code /api/*} the same way.
  //
  // Port resolves from, in order:
  //   1. FRONTEND_PORT — explicit override (local .env.preview sets 4173)
  //   2. PORT          — Railway / Heroku / Fly inject this directly on the
  //                      container at runtime. Railway template refs like
  //                      `${{PORT}}` don't resolve for the auto-injected
  //                      PORT, so we must read it as a plain env var here.
  //   3. 4173          — bare `npm run preview` fallback.
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.FRONTEND_PORT) || Number(process.env.PORT) || 4173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:8080',
        changeOrigin: true,
        // Disable upstream connection pooling. With pooling on, an
        // active SSE pins one socket open for the full stream
        // duration; subsequent requests over the same pooled
        // connection wait until that socket frees up — which mostly
        // looks like "the second translation never starts". `agent:
        // false` forces a fresh upstream socket per request.
        agent: false,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
