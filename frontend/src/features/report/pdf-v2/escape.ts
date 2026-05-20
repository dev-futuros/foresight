/**
 * HTML escape helper. Used to inject ANY user-supplied or AI-generated
 * text into the report template. The template is rendered into an
 * iframe and printed; anything that lands in innerHTML must be escaped
 * to keep stray `<`, `>`, `&` etc. from breaking the markup (or worse —
 * landing as executable script).
 *
 * <p>The renderer intentionally does NOT support Markdown / inline HTML
 * from AI output. The analysis prompts produce plain prose; if a future
 * prompt ever returns markup, it gets neutralised here.
 */
export function escapeHtml(input: string | number | null | undefined): string {
  if (input == null) return '';
  const s = String(input);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch === 38 /* & */) out += '&amp;';
    else if (ch === 60 /* < */) out += '&lt;';
    else if (ch === 62 /* > */) out += '&gt;';
    else if (ch === 34 /* " */) out += '&quot;';
    else if (ch === 39 /* ' */) out += '&#39;';
    else out += s[i];
  }
  return out;
}

/**
 * Strip the URL protocol and trailing slash for compact bibliography
 * URLs per §5.12 of the layout spec (`mono-url` rendering). Returns the
 * original string when it doesn't look like a URL — keep plain strings
 * untouched.
 */
export function compactUrl(raw: string | null | undefined, maxLen = 72): string {
  if (!raw) return '';
  let s = raw.trim();
  s = s.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (s.length > maxLen) s = s.slice(0, maxLen - 1) + '…';
  return s;
}
