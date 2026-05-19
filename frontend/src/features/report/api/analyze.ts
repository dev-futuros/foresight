/**
 * Analyze pipeline — the five parallel section calls plus the up-front
 * scan that gives them shared research context.
 *
 * Streaming flow:
 *   • POST to /api/ai/analyze/<section> opens an SSE response
 *   • backend emits {type:'progress', chars, sources} ~5x/s
 *   • final {type:'done', text, citations} arrives
 *   • we parse the text via parseJsonText (with the JSON-repair
 *     fallback) and resolve with {result, citations}
 *
 * Uses fetch() directly (not axios) because axios buffers the whole
 * response body before resolving, which would defeat streaming.
 */
import * as Sentry from '@sentry/react';
import api, { getAuthToken } from '../../../lib/api';
import { logger } from '../../../lib/log';
import { parseJson, parseJsonText, type AnthropicResponse } from '../../../lib/anthropicJson';
import { parseSseFrameJson, splitSseFrame } from '../../../lib/sse';
import type {
  AnalyzeArgs,
  AnalyzeReport,
  AnalyzeSectionResponse,
  AnalyzeSummary,
  Backcasting,
  ProgressCallback,
  Scenario,
  ScenarioPlanning,
  SourceItem,
  Sources,
  StrategicMap,
} from '../../../types/api';

/**
 * Generic SSE POST + stream-consume helper. Used by both the analyze
 * section calls and the Step 2 Global STEEP calls (see ./steep.ts) —
 * they share the same `{type:'progress'|'done', ...}` event envelope.
 *
 * Resolves with the final parsed result + citations once the stream
 * emits a `done` event. Throws clearly when the response isn't SSE or
 * the stream closes empty.
 */
export async function streamSse<TBody, T>(
  path: string,
  body: TBody,
  parser: (text: string) => T,
  onProgress?: ProgressCallback,
): Promise<AnalyzeSectionResponse<T>> {
  try {
    return await streamSseInner(path, body, parser, onProgress);
  } catch (err) {
    // Capture before rethrowing so the caller's own catch block still
    // fires (analyze sections are called via Promise.allSettled in the
    // wizard's runAnalysis handler, which surfaces failures per
    // section to the loader UI). The `path` tag in Sentry groups
    // failures by which analyze section blew up, which is the most
    // useful slice when triaging.
    Sentry.captureException(err, {
      tags: { kind: 'sse-stream', path },
    });
    throw err;
  }
}

async function streamSseInner<TBody, T>(
  path: string,
  body: TBody,
  parser: (text: string) => T,
  onProgress?: ProgressCallback,
): Promise<AnalyzeSectionResponse<T>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `/api/${path}`;
  const debug =
    typeof window !== 'undefined' && window.localStorage?.getItem('streamDebug') === '1';

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (debug) {
    logger.debug('streamSse', `${url} →`, res.status, res.statusText, {
      contentType: res.headers.get('content-type'),
    });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${detail.slice(0, 200)}`);
  }
  if (!res.body) {
    throw new Error('Stream response had no body');
  }
  // Reverse-proxy stripping the content type would let fetch hang
  // forever — bail loud instead.
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('text/event-stream')) {
    throw new Error(`Expected text/event-stream, got "${ct}"`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalText = '';
  let citations: SourceItem[] = [];
  let frameCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let next = splitSseFrame(buffer);
      while (next !== null) {
        const { frame, rest } = next;
        buffer = rest;
        frameCount += 1;
        const evt = parseSseFrameJson<
          | { type: 'progress'; chars: number; sources: number }
          | { type: 'done'; text: string; citations: SourceItem[] }
        >(frame);
        if (evt === undefined) {
          next = splitSseFrame(buffer);
          continue;
        }
        if (evt.type === 'progress') {
          onProgress?.({ chars: evt.chars, sources: evt.sources });
        } else if (evt.type === 'done') {
          finalText = evt.text;
          citations = Array.isArray(evt.citations) ? evt.citations : [];
        }
        next = splitSseFrame(buffer);
      }
    }
  } catch (err) {
    // Trailing reader error after the `done` event already landed:
    // Railway / Caddy / Vite preview sometimes signal an abrupt drop
    // instead of a clean EOF after the upstream Flux completes, and
    // that surfaces here as a read error on bytes we don't care
    // about. {@code finalText} is the authoritative payload — if
    // it's set, the SSE stream delivered everything we need and the
    // trailing error is a proxy quirk to swallow. Without this guard
    // the analyze section's progress dot goes red on a successful run.
    //
    // If finalText is still empty the stream genuinely failed
    // mid-flight — rethrow so the outer Sentry-instrumented wrapper
    // captures it.
    if (!finalText) throw err;
    if (debug) {
      logger.warn('streamSse', `${url} trailing read error after done`, err);
    }
  }
  if (debug) {
    logger.debug('streamSse', `${url} closed`, {
      frames: frameCount,
      finalTextLen: finalText.length,
      citations: citations.length,
    });
  }
  if (!finalText) {
    throw new Error(
      `Stream closed before final response (received ${frameCount} frame${frameCount === 1 ? '' : 's'})`,
    );
  }
  return { result: parser(finalText), citations };
}

/** Legacy unary endpoint that returned the whole AnalyzeReport at once. */
export async function analyze(args: AnalyzeArgs): Promise<AnalyzeReport> {
  const { data } = await api.post<AnthropicResponse>('ai/analyze', args);
  return parseJson<AnalyzeReport>(data);
}

/**
 * Up-front research pass — runs once before the 5 parallel section
 * calls. Streams a web_search-enabled call that gathers concrete,
 * dated facts about the sector + strategic challenge. The result text
 * (the `research` field) and citations are then handed to each of the
 * 5 analyze section calls as their shared context.
 *
 * <p>Cuts total web_search budget from ~25 (5 sections × 5 uses each)
 * down to ~5.
 */
export async function analyzeScan(
  args: AnalyzeArgs,
  onProgress?: ProgressCallback,
): Promise<{ research: string; citations: SourceItem[] }> {
  const res = await streamSse<AnalyzeArgs, string>(
    'ai/analyze/scan',
    args,
    (text) => text.trim(),
    onProgress,
  );
  return { research: res.result, citations: res.citations };
}

/** Phase-A — executive summary, uncertainties, signals, wildcards. */
export async function analyzeSummary(
  args: AnalyzeArgs,
  onProgress?: ProgressCallback,
): Promise<AnalyzeSectionResponse<AnalyzeSummary>> {
  return streamSse(
    'ai/analyze/summary',
    args,
    (text) => parseJsonText<AnalyzeSummary>(text),
    onProgress,
  );
}

/** Phase-B — the 3P scenarios. */
export async function analyzeScenarios(
  args: AnalyzeArgs,
  onProgress?: ProgressCallback,
): Promise<AnalyzeSectionResponse<{ scenarios?: Scenario[] }>> {
  return streamSse(
    'ai/analyze/scenarios',
    args,
    (text) => parseJsonText<{ scenarios?: Scenario[] }>(text),
    onProgress,
  );
}

/**
 * Section-C — the backend wraps the payload under "scenarioPlanning".
 * We unwrap so callers can address `result.intro` etc. directly.
 */
export async function analyzeScenarioPlanning(
  args: AnalyzeArgs,
  onProgress?: ProgressCallback,
): Promise<AnalyzeSectionResponse<ScenarioPlanning>> {
  return streamSse(
    'ai/analyze/scenario-planning',
    args,
    (text) => {
      const parsed = parseJsonText<{ scenarioPlanning?: ScenarioPlanning } & ScenarioPlanning>(
        text,
      );
      return parsed.scenarioPlanning ?? parsed;
    },
    onProgress,
  );
}

/** Section-E — backend returns `{backcasting: [...]}`; we unwrap. */
export async function analyzeBackcasting(
  args: AnalyzeArgs,
  onProgress?: ProgressCallback,
): Promise<AnalyzeSectionResponse<Backcasting>> {
  return streamSse(
    'ai/analyze/backcasting',
    args,
    (text) => {
      const parsed = parseJsonText<{ backcasting?: Backcasting }>(text);
      return parsed.backcasting ?? [];
    },
    onProgress,
  );
}

/** Section-D — backend returns `{strategicPriorities: [...]}`; we unwrap. */
export async function analyzeStrategicMap(
  args: AnalyzeArgs,
  onProgress?: ProgressCallback,
): Promise<AnalyzeSectionResponse<StrategicMap>> {
  return streamSse(
    'ai/analyze/strategic-map',
    args,
    (text) => {
      const parsed = parseJsonText<{ strategicPriorities?: StrategicMap }>(text);
      return parsed.strategicPriorities ?? [];
    },
    onProgress,
  );
}

/** Unary endpoint — sources doesn't stream. */
export async function analyzeSources(args: AnalyzeArgs): Promise<Sources> {
  const { data } = await api.post<AnthropicResponse>('ai/analyze/sources', args);
  return parseJson<Sources>(data);
}
