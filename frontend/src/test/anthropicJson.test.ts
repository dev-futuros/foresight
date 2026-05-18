import { describe, expect, it } from 'vitest';
import { parseJsonText, repairJsonString } from '../lib/anthropicJson';

describe('repairJsonString', () => {
  it('passes through valid JSON unchanged', () => {
    const input = '{"name":"foo","value":42}';
    expect(JSON.parse(repairJsonString(input))).toEqual({ name: 'foo', value: 42 });
  });

  it('escapes raw newlines inside string values', () => {
    const input = '{"text":"line1\nline2"}';
    // raw \n inside a string literal — JSON.parse rejects, repair fixes
    expect(() => JSON.parse(input)).toThrow();
    expect(JSON.parse(repairJsonString(input))).toEqual({ text: 'line1\nline2' });
  });

  it('rewrites single-quoted strings as double-quoted', () => {
    const input = "{'name':'foo'}";
    expect(JSON.parse(repairJsonString(input))).toEqual({ name: 'foo' });
  });

  it('wraps bare-identifier property names', () => {
    const input = '{name:"foo",value:42}';
    expect(JSON.parse(repairJsonString(input))).toEqual({ name: 'foo', value: 42 });
  });

  it('strips trailing commas before } and ]', () => {
    const input = '{"a":[1,2,3,],"b":42,}';
    expect(JSON.parse(repairJsonString(input))).toEqual({ a: [1, 2, 3], b: 42 });
  });

  it('escapes unescaped inner double-quotes (model emits unquoted speech)', () => {
    // The model wrote a sentence like  She said "yes" already.  inside a
    // string value, without escaping the inner quotes. The repair pass
    // should recognise that the inner `"hi"` quotes are content (they're
    // not followed by `,` / `}` / `]` / `:`), escape them, and let the
    // outer pair close the value normally.
    const input = '{"quote":"She said "yes" already","next":1}';
    expect(() => JSON.parse(input)).toThrow();
    const repaired = repairJsonString(input);
    expect(JSON.parse(repaired)).toEqual({ quote: 'She said "yes" already', next: 1 });
  });

  it('handles inner double-quotes at end of value', () => {
    // Inner quote right before the value-closing quote.
    const input = '{"q":"He said "no""}';
    expect(JSON.parse(repairJsonString(input))).toEqual({ q: 'He said "no"' });
  });

  it('does not corrupt a single-key object whose value contains the key-separator pattern', () => {
    // Edge case: a value like `"foo: bar"` shouldn't trip the repair —
    // the `:` after `foo` is INSIDE a string, not a structural key/value
    // separator.
    const input = '{"label":"key: value"}';
    expect(JSON.parse(repairJsonString(input))).toEqual({ label: 'key: value' });
  });
});

describe('parseJsonText', () => {
  it('parses well-formed wrapped JSON', () => {
    const text = 'Some preamble {"ok":true} trailing junk';
    expect(parseJsonText<{ ok: boolean }>(text)).toEqual({ ok: true });
  });

  it('parses JSON wrapped in markdown fences', () => {
    const text = '```json\n{"ok":true}\n```';
    expect(parseJsonText<{ ok: boolean }>(text)).toEqual({ ok: true });
  });

  it('falls back to the repair pass for malformed input', () => {
    // Unescaped inner quotes — the first JSON.parse will fail, the
    // repair pass should recover.
    const text = '{"q":"They said "ok" and left."}';
    expect(parseJsonText<{ q: string }>(text)).toEqual({ q: 'They said "ok" and left.' });
  });

  it('throws with a diagnostic message when both passes fail', () => {
    // Something the repair cannot fix — a value that's neither a
    // string nor a number nor a recognised keyword (the
    // bare-identifier wrap only triggers when followed by a colon,
    // i.e. when it looks like a KEY; as a VALUE it stays a syntax
    // error). Has a closing brace so we get past the early-bail
    // "No JSON object found" check.
    const text = '{"x": bogus}';
    try {
      parseJsonText(text);
      throw new Error('expected parseJsonText to throw');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // The diagnostic should mention both passes and surface a snippet.
      expect(msg).toContain('JSON parse failed after repair pass');
      expect(msg).toContain('first parse');
      expect(msg).toContain('original');
    }
  });

  it('throws cleanly when the response contains no JSON object at all', () => {
    expect(() => parseJsonText('I cannot complete this request.')).toThrow(
      /No JSON object found/,
    );
  });
});
