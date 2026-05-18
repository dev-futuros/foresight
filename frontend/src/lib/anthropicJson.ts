/**
 * Helpers for the {@code /api/ai/*} proxy responses.
 *
 * The Anthropic backend can return JSON in two shapes — sometimes a
 * direct object (when the response has no tool_use blocks), sometimes
 * wrapped inside Anthropic's {@code content: [{type:'text', text}]}
 * envelope. {@link parseJson} handles both; {@link parseJsonText} is
 * the variant for streaming consumers that have already extracted the
 * text out of {@code text_delta} events.
 *
 * Both call {@link repairJsonString} as a fallback when {@code
 * JSON.parse} rejects the raw model output — long analyze responses
 * occasionally slip in raw newlines, single-quoted strings, bare
 * identifier keys, or trailing commas, and the repair walker fixes
 * the common cases without touching string-literal content.
 */

export interface AnthropicContentBlock {
  type: string;
  text?: string;
}

/**
 * Loose envelope: any of these fields might be present depending on
 * which endpoint returned the response. Callers narrow further with
 * {@link parseJson}.
 */
export interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  // Some endpoints return the parsed JSON object directly (no content
  // wrapper). Specialised fields callers may rely on:
  factors?: unknown;
  signals?: unknown;
  S?: string;
  T?: string;
  E?: string;
  ENV?: string;
  P?: string;
}

export function extractText(payload: AnthropicResponse): string {
  if (!payload.content) return '';
  return payload.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text!)
    .join('')
    .trim();
}

export function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Best-effort repair of the most common JSON malformations the model
 * produces, so that long analyze responses don't crash {@code
 * JSON.parse} over a single rogue character buried at column 849. The
 * walker tracks whether the current position is inside a {@code "..."}
 * string and runs different fixes inside vs. outside string literals.
 *
 * <p>Inside string literals it escapes raw control characters
 * ({@code \n} / {@code \r} / {@code \t}) — the analyze prompts invite
 * {@code \n\n} paragraph breaks inside long prose fields and the model
 * frequently honours that intent with literal newlines, which the JSON
 * spec forbids inside strings.
 *
 * <p>Outside string literals it repairs three structural slips that
 * surface as "Expected double-quoted property name…" or "Unexpected
 * token…" errors:
 *
 * <ol>
 *   <li><b>Single-quoted strings</b> — {@code 'foo':} or {@code :'bar'}
 *       — rewritten with double quotes (inner doubles get backslash-
 *       escaped).</li>
 *   <li><b>Bare-identifier keys</b> — {@code foo:} with no quotes at
 *       all — wrapped in double quotes.</li>
 *   <li><b>Trailing commas</b> — {@code ,}} and {@code ,]} stripped of
 *       the dangling comma.</li>
 * </ol>
 *
 * <p>None of these repairs touch content inside string literals, so
 * prose fields with quotes / commas / colons survive unchanged.
 */
export function repairJsonString(s: string): string {
  // Pass 1: walk the source tracking the inside/outside-string state.
  // Fix raw control chars in-place inside strings, and rewrite single-
  // quoted string literals to double-quoted ones outside strings.
  let pass1 = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) {
      pass1 += c;
      esc = false;
      continue;
    }
    if (c === '\\') {
      pass1 += c;
      esc = true;
      continue;
    }
    if (inStr) {
      if (c === '"') {
        // Lookahead heuristic: is this the string CLOSER, or an
        // unescaped inner quote (e.g. model wrote: `"She said "yes""`)?
        // Skip whitespace and check what comes next:
        //   • `:` → this `"` closed a key
        //   • `,` / `}` / `]` → this `"` closed a value
        //   • end of input → also treat as closer (truncation case)
        //   • anything else (a letter, digit, another `"`, …) →
        //     unescaped inner quote; escape it as `\"` and stay in
        //     the string. This is the most common malformation we
        //     see from the model on long prose fields with embedded
        //     quoted phrases.
        let k = i + 1;
        while (k < s.length && /\s/.test(s[k])) k++;
        const next = k < s.length ? s[k] : '';
        if (next === ':' || next === ',' || next === '}' || next === ']' || next === '') {
          inStr = false;
          pass1 += c;
          continue;
        }
        pass1 += '\\"';
        continue;
      }
      if (c === '\n') {
        pass1 += '\\n';
        continue;
      }
      if (c === '\r') {
        pass1 += '\\r';
        continue;
      }
      if (c === '\t') {
        pass1 += '\\t';
        continue;
      }
      pass1 += c;
      continue;
    }
    // Outside any string.
    if (c === '"') {
      inStr = true;
      pass1 += c;
      continue;
    }
    if (c === "'") {
      let lifted = '"';
      let j = i + 1;
      let innerEsc = false;
      while (j < s.length) {
        const cc = s[j];
        if (innerEsc) {
          lifted += cc;
          innerEsc = false;
          j++;
          continue;
        }
        if (cc === '\\') {
          lifted += cc;
          innerEsc = true;
          j++;
          continue;
        }
        if (cc === "'") {
          break;
        }
        if (cc === '"') {
          lifted += '\\"';
          j++;
          continue;
        }
        if (cc === '\n') {
          lifted += '\\n';
          j++;
          continue;
        }
        if (cc === '\r') {
          lifted += '\\r';
          j++;
          continue;
        }
        if (cc === '\t') {
          lifted += '\\t';
          j++;
          continue;
        }
        lifted += cc;
        j++;
      }
      lifted += '"';
      pass1 += lifted;
      i = j;
      continue;
    }
    pass1 += c;
  }

  // Pass 2: wrap bare-identifier property names and strip trailing
  // commas. Re-tracks inside-string state because Pass 1 emitted new
  // "..." literals from single-quoted source.
  let pass2 = '';
  inStr = false;
  esc = false;
  for (let i = 0; i < pass1.length; i++) {
    const c = pass1[i];
    if (esc) {
      pass2 += c;
      esc = false;
      continue;
    }
    if (c === '\\') {
      pass2 += c;
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      pass2 += c;
      continue;
    }
    if (inStr) {
      pass2 += c;
      continue;
    }
    if (c === '{' || c === '[' || c === ',') {
      // First: handle the trailing-comma case (,} or ,]). Strip the
      // dangling comma; whitespace + closer carries through normally
      // via the outer loop's pass2 += c path on later iterations.
      if (c === ',') {
        let k0 = i + 1;
        while (k0 < pass1.length && /\s/.test(pass1[k0])) k0++;
        if (pass1[k0] === '}' || pass1[k0] === ']') {
          continue;
        }
      }
      // Otherwise, check for a bare-identifier key in the position
      // immediately after this delimiter ({foo: …, bar: …) and wrap
      // it in double quotes. Matched only when the identifier is
      // really followed by a colon — that's what distinguishes a key
      // from a value token (true/false/null/number/etc.).
      let k = i + 1;
      while (k < pass1.length && /\s/.test(pass1[k])) k++;
      if (k < pass1.length && /[A-Za-z_$]/.test(pass1[k])) {
        const start = k;
        while (k < pass1.length && /[A-Za-z0-9_$]/.test(pass1[k])) k++;
        const ident = pass1.slice(start, k);
        let m = k;
        while (m < pass1.length && /\s/.test(pass1[m])) m++;
        if (pass1[m] === ':' && ident !== 'true' && ident !== 'false' && ident !== 'null') {
          pass2 += c;
          pass2 += pass1.slice(i + 1, start);
          pass2 += '"' + ident + '"';
          i = k - 1;
          continue;
        }
      }
      pass2 += c;
      continue;
    }
    pass2 += c;
  }

  return pass2;
}

/**
 * Parses an Anthropic proxy response into the target shape. Handles
 * both the wrapped-in-content envelope and the direct-payload shape,
 * with a repair-pass fallback when {@code JSON.parse} rejects the raw
 * model output.
 */
export function parseJson<T>(payload: AnthropicResponse): T {
  const text = extractText(payload);
  if (text) {
    const cleaned = stripFences(text);
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last !== -1) {
      const slice = cleaned.slice(first, last + 1);
      try {
        return JSON.parse(slice) as T;
      } catch (firstErr) {
        const repaired = repairJsonString(slice);
        try {
          return JSON.parse(repaired) as T;
        } catch (secondErr) {
          throw new Error(buildRepairFailureMessage(slice, repaired, firstErr, secondErr));
        }
      }
    }
  }
  return payload as unknown as T;
}

/**
 * Apply the JSON-extract + repair pipeline to a plain text string.
 * Mirrors {@link parseJson} but operates on already-extracted text —
 * what streaming consumers hold after assembling text-delta fragments.
 */
export function parseJsonText<T>(text: string): T {
  const cleaned = stripFences(text);
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1) {
    const preview = cleaned.trim().slice(0, 240);
    const suffix =
      preview.length === 0
        ? ' (empty response)'
        : ` — got: "${preview}${cleaned.length > 240 ? '…' : ''}"`;
    throw new Error(`No JSON object found in streamed response${suffix}`);
  }
  const slice = cleaned.slice(first, last + 1);
  try {
    return JSON.parse(slice) as T;
  } catch (firstErr) {
    // First parse failed — run the repair pass and try again. If THAT
    // fails too, throw with a snippet of the offending text around the
    // parser's reported position so the failure is self-debugging
    // instead of forcing the developer to enable streamDebug and reproduce.
    const repaired = repairJsonString(slice);
    try {
      return JSON.parse(repaired) as T;
    } catch (secondErr) {
      throw new Error(buildRepairFailureMessage(slice, repaired, firstErr, secondErr));
    }
  }
}

/**
 * Build the failure message we throw when both JSON.parse passes fail.
 *
 * <p>Includes:
 *   • the second-pass parser's message (Position N + Expected X)
 *   • a ~120-char window around that position in the repaired text, so
 *     the actual malformation is visible without reproducing the bug
 *   • the equivalent window in the ORIGINAL (pre-repair) text, so the
 *     reader can see whether the repair pass mangled something or the
 *     model simply emitted unhandled syntax
 */
function buildRepairFailureMessage(
  original: string,
  repaired: string,
  firstErr: unknown,
  secondErr: unknown,
): string {
  const msg = secondErr instanceof Error ? secondErr.message : String(secondErr);
  const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
  // SyntaxError messages look like "... at position 1048 (line 1 column 1049)"
  // — grab the position number for a windowed snippet.
  const posMatch = /position (\d+)/.exec(msg);
  const pos = posMatch ? Number.parseInt(posMatch[1], 10) : -1;
  const window = 60;
  const repairedSnippet =
    pos >= 0
      ? `[repaired @${pos}] …${repaired.slice(Math.max(0, pos - window), pos + window)}…`
      : `[repaired head] ${repaired.slice(0, 240)}…`;
  // Map the repaired-text position back to roughly the same place in
  // the original — character offsets drift through the repair pass but
  // a same-radius window is usually close enough to spot the original
  // malformation.
  const originalSnippet =
    pos >= 0
      ? `[original @~${pos}] …${original.slice(Math.max(0, pos - window), pos + window)}…`
      : `[original head] ${original.slice(0, 240)}…`;
  return [
    `JSON parse failed after repair pass: ${msg}`,
    `(first parse: ${firstMsg})`,
    repairedSnippet,
    originalSnippet,
  ].join('\n');
}
