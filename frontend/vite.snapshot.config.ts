import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'node:path';

/**
 * Separate Vite config that builds the standalone snapshot entry —
 * {@code share-snapshot.html} + {@code src/share-snapshot.tsx} — into a
 * single self-contained HTML file via vite-plugin-singlefile.
 *
 * <p>Kept apart from the main {@code vite.config.ts} because
 * vite-plugin-singlefile inlines every JS/CSS asset into every HTML
 * entry in the build — desirable for the snapshot (one bucket-uploadable
 * file with no external requests beyond Google Fonts), undesirable for
 * the main SPA (which needs code splitting for performance).
 *
 * <p>Output lands in {@code dist/share-snapshot.html} so the same
 * deployment that serves the SPA also serves the snapshot host page at
 * {@code /share-snapshot.html}. The browser-side export pipeline
 * ({@code src/lib/exportHtml.tsx}) fetches that URL, splices in the
 * report payload, and triggers a download.
 *
 * <p>Build command: {@code vite build --config vite.snapshot.config.ts}
 * (run as {@code npm run build:snapshot}).
 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    // Emit alongside the main SPA's dist/ so a single deploy ships both.
    // emptyOutDir:false ensures running build:snapshot doesn't blow away
    // the SPA's assets when run after the main build.
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'share-snapshot.html'),
    },
    // Keep the asset names predictable; singlefile inlines them anyway
    // but a stable name helps if someone inspects the source.
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
  },
});
