/**
 * Tiny inline-markdown renderer for chat bubbles. Supports bold
 * (**x**), italic (*x*), and code (`x`); everything else passes
 * through HTML-escaped. The result is intended for
 * dangerouslySetInnerHTML — escapeHtml runs FIRST so unintended HTML
 * in user/model text is neutralised before the markdown pass adds
 * the small set of tags we trust.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderInlineMd(text: string): string {
  let h = escapeHtml(text);
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  return h;
}
