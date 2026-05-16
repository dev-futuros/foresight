import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
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