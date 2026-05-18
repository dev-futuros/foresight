/**
 * Generic SSE helpers shared by the streaming endpoints across
 * features. Each consumer (analyze, chat, translate) has its own
 * event-shape parser on top of this — only the framing logic lives
 * here.
 */

/**
 * Split an SSE event off the front of a buffer. SSE frames are
 * separated by a blank line; spec is LF-LF but some proxies normalise
 * to CRLF-CRLF, so we match both. Returns null when no full frame is
 * available yet (caller should read more from the stream).
 */
export function splitSseFrame(buffer: string): { frame: string; rest: string } | null {
  const lflf = buffer.indexOf('\n\n');
  const crlflf = buffer.indexOf('\r\n\r\n');
  if (lflf === -1 && crlflf === -1) return null;
  if (crlflf !== -1 && (lflf === -1 || crlflf < lflf)) {
    return { frame: buffer.slice(0, crlflf), rest: buffer.slice(crlflf + 4) };
  }
  return { frame: buffer.slice(0, lflf), rest: buffer.slice(lflf + 2) };
}

/**
 * Parse the {@code data:} payload of a single SSE frame as JSON.
 * Multiple {@code data:} lines are joined with a literal newline
 * before parsing (the spec calls this the "data buffer"). Returns
 * undefined when the frame has no data lines or the payload isn't
 * valid JSON — callers decide whether that's an error or just a
 * keepalive to skip.
 */
export function parseSseFrameJson<T = unknown>(frame: string): T | undefined {
  const dataLines = frame
    .split(/\r?\n/)
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trimStart());
  if (dataLines.length === 0) return undefined;
  try {
    return JSON.parse(dataLines.join('\n')) as T;
  } catch {
    return undefined;
  }
}
