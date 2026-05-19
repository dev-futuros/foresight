import type { LanguageCode } from '../../../i18n/languages';
/**
 * Streaming variant of the translate endpoint. Opens an SSE connection
 * to the backend and surfaces `progress` events to the caller as the
 * translation streams in. Resolves with the final TranslatedReport once
 * the `done` event lands; rejects if the stream closes before
 * completion or the backend errors.
 *
 * <p>Deliberately NOT a React hook so it can be called from anywhere —
 * including the export flow on ReportPage and the dashboard's
 * TranslationsContext. Callers that want React Query cache invalidation
 * should ALSO hit `useTranslateReport()` (the unary endpoint); this
 * function is for the progress-bar path where we want character-level
 * progress as the model writes.
 *
 * <p>The `kind` parameter picks between the per-report and per-example
 * streaming endpoints — both speak the same SSE protocol so the
 * consumer is identical.
 */
import * as Sentry from '@sentry/react';
import { getAuthToken } from '../../../lib/api';
import type { TranslatedReport } from '../../../types/api';

/**
 * Progress event surfaced from the streaming translate endpoint while
 * the model is writing. `outputChars / inputChars` is roughly 0..1 and
 * drives the determinate progress bar in the share/export dialogs (the
 * translated envelope ends up about the same length as the source).
 */
export interface TranslateProgress {
  inputChars: number;
  outputChars: number;
}

export async function translateReportStream(args: {
  id: string;
  targetLanguage: LanguageCode;
  force?: boolean;
  onProgress?: (progress: TranslateProgress) => void;
  signal?: AbortSignal;
  /** Defaults to 'report' (the per-user translate flow). Pass 'example'
   *  for the DEV-side translate-example flow, which writes to the
   *  shared examples table instead of the caller's report row. */
  kind?: 'report' | 'example';
}): Promise<TranslatedReport> {
  const kind = args.kind ?? 'report';
  try {
    return await translateReportStreamInner(args);
  } catch (err) {
    // AbortError is benign — it fires when a consumer cancels the
    // stream (e.g. user navigates away mid-translate). Not a real
    // failure; skip the Sentry capture.
    if ((err as Error | undefined)?.name !== 'AbortError') {
      Sentry.captureException(err, {
        tags: {
          kind: 'sse-stream',
          path: `${kind === 'example' ? 'examples' : 'reports'}/translate/stream`,
        },
        extra: { targetLanguage: args.targetLanguage, force: args.force ?? false },
      });
    }
    throw err;
  }
}

async function translateReportStreamInner(args: {
  id: string;
  targetLanguage: LanguageCode;
  force?: boolean;
  onProgress?: (progress: TranslateProgress) => void;
  signal?: AbortSignal;
  kind?: 'report' | 'example';
}): Promise<TranslatedReport> {
  const { id, targetLanguage, force = false, onProgress, signal, kind = 'report' } = args;
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const base = kind === 'example' ? 'examples' : 'reports';
  const url =
    `/api/${base}/${encodeURIComponent(id)}/translate/stream` +
    `?targetLanguage=${encodeURIComponent(targetLanguage)}` +
    `&force=${force ? 'true' : 'false'}`;

  const res = await fetch(url, { method: 'POST', headers, signal });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `HTTP ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ''}`,
    );
  }
  if (!res.body) {
    throw new Error('Stream response had no body');
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('text/event-stream')) {
    throw new Error(`Expected text/event-stream, got "${ct}"`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalPayload: TranslatedReport | null = null;

  // SSE frame splitter — same dual LF/CRLF tolerance as aiClient.ts so
  // proxies that normalise line endings don't break the consumer.
  const splitFrame = (b: string): { frame: string; rest: string } | null => {
    const lflf = b.indexOf('\n\n');
    const crlflf = b.indexOf('\r\n\r\n');
    if (lflf === -1 && crlflf === -1) return null;
    if (crlflf !== -1 && (lflf === -1 || crlflf < lflf)) {
      return { frame: b.slice(0, crlflf), rest: b.slice(crlflf + 4) };
    }
    return { frame: b.slice(0, lflf), rest: b.slice(lflf + 2) };
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let next = splitFrame(buffer);
    while (next !== null) {
      const { frame, rest } = next;
      buffer = rest;
      const dataLines = frame
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart());
      if (dataLines.length === 0) {
        next = splitFrame(buffer);
        continue;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(dataLines.join('\n'));
      } catch {
        next = splitFrame(buffer);
        continue;
      }
      const evt = payload as
        | { type: 'progress'; inputChars: number; outputChars: number }
        | ({ type: 'done' } & TranslatedReport);
      if (evt.type === 'progress') {
        onProgress?.({
          inputChars: evt.inputChars,
          outputChars: evt.outputChars,
        });
      } else if (evt.type === 'done') {
        finalPayload = {
          inputData: evt.inputData,
          resultData: evt.resultData,
          generatedAt: evt.generatedAt,
        };
      }
      next = splitFrame(buffer);
    }
  }

  if (!finalPayload) {
    throw new Error('Translation stream closed before final response');
  }
  return finalPayload;
}
