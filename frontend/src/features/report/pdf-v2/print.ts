import { logger } from '../../../lib/log';

/**
 * Render an HTML document into a hidden iframe and trigger the
 * browser's native print dialog against it. The user sees the system
 * "Save as PDF" dialog with a print-perfect preview of the report.
 *
 * <p>Why not {@code window.open(...)} + print? That route opens a
 * second tab the user has to dismiss after saving. An off-screen
 * iframe keeps the app tab in focus and disposes itself after the
 * print interaction settles. Safari is the awkward case — its
 * {@code print()} on cross-origin frames is opaque; same-origin
 * blob URLs work fine.
 *
 * <p>The function resolves AFTER the print dialog is dismissed
 * (either by saving or cancelling), then cleans up the iframe.
 */
export async function printHtmlDocument(html: string): Promise<void> {
  // We use a Blob URL so the iframe is genuinely same-origin and
  // honours our @font-face declarations (relative URLs against the
  // app origin). Inline srcdoc would also work, but Chrome's print
  // engine has historically been quirky about font fetching for
  // srcdoc documents under the data: scheme.
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  // Fully off-screen but rendered (display: none disables layout in
  // some browsers and breaks print).
  iframe.style.position = 'fixed';
  iframe.style.left = '-100000px';
  iframe.style.top = '0';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.src = url;

  document.body.appendChild(iframe);

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('iframe load timeout'));
    }, 15_000);
    iframe.addEventListener(
      'load',
      () => {
        window.clearTimeout(timeoutId);
        resolve();
      },
      { once: true },
    );
    iframe.addEventListener(
      'error',
      () => {
        window.clearTimeout(timeoutId);
        reject(new Error('iframe load error'));
      },
      { once: true },
    );
  });

  // Wait for fonts to finish loading inside the iframe before firing
  // the print — otherwise Chrome can capture the FOUT (fallback fonts)
  // for the first paint.
  try {
    const idoc = iframe.contentDocument;
    if (idoc && 'fonts' in idoc) {
      await (idoc as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready;
    }
  } catch (err) {
    logger.warn('pdf-v2', 'document.fonts.ready failed; printing anyway', err);
  }

  const win = iframe.contentWindow;
  if (!win) {
    URL.revokeObjectURL(url);
    iframe.remove();
    throw new Error('iframe contentWindow is null');
  }

  // Wire up cleanup. afterprint fires whether the user saved or
  // cancelled. Add a safety timeout in case the browser eats the event.
  const cleanup = () => {
    try {
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.warn('pdf-v2', 'revokeObjectURL failed', err);
    }
    iframe.remove();
  };

  await new Promise<void>((resolve) => {
    let settled = false;
    const onAfter = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    win.addEventListener('afterprint', onAfter, { once: true });
    // Safety net — if afterprint never fires, give the user 60s to
    // interact with the dialog then tear the iframe down.
    window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }, 60_000);
    // Focus the iframe content so the print dialog opens on the
    // correct document.
    try {
      win.focus();
    } catch (err) {
      logger.warn('pdf-v2', 'iframe focus failed', err);
    }
    win.print();
  });
}
