import api, { getAuthToken } from './api';

/**
 * Thin wrappers around the backend `/api/ai/*` proxy endpoints. The Anthropic API key
 * lives server-side only — the browser never sees it. Each call returns parsed JSON
 * extracted from Claude's `text` content blocks.
 */

export interface SuggestionItem {
  title: string;
  description: string;
}

export interface GlobalSteep {
  S: string;
  T: string;
  E: string;
  ENV: string;
  P: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  // Some endpoints return the parsed JSON object directly when no tools are involved.
  factors?: SuggestionItem[];
  signals?: SuggestionItem[];
  S?: string;
  T?: string;
  E?: string;
  ENV?: string;
  P?: string;
}

function extractText(payload: AnthropicResponse): string {
  if (!payload.content) return '';
  return payload.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text!)
    .join('')
    .trim();
}

function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Escapes unescaped control characters (raw newline / carriage return / tab)
 * that appear INSIDE JSON string literals so the result is a strictly valid
 * JSON document.
 *
 * <p>The new analyze prompts explicitly invite the model to emit `\n\n`
 * paragraph breaks inside long prose fields (executiveSummary, scenario
 * description, …). The model often respects the spirit of that by emitting
 * a literal newline in the JSON output — which is forbidden by the JSON
 * spec inside a string and crashes {@code JSON.parse}. This walker mirrors
 * the demo's `repairAndParseJSON` helper: it tracks whether we are inside a
 * string and rewrites raw `\n` / `\r` / `\t` as their escape sequences,
 * leaving anything outside string literals untouched.
 */
function repairJsonString(s: string): string {
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) {
      out += c;
      esc = false;
      continue;
    }
    if (c === '\\') {
      out += c;
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      out += c;
      continue;
    }
    if (inStr) {
      if (c === '\n') { out += '\\n'; continue; }
      if (c === '\r') { out += '\\r'; continue; }
      if (c === '\t') { out += '\\t'; continue; }
    }
    out += c;
  }
  return out;
}

function parseJson<T>(payload: AnthropicResponse): T {
  // Backend may have already returned the parsed JSON shape (e.g. when Claude responds
  // with a single text block we still wrap it in `content`). Try both paths.
  const text = extractText(payload);
  if (text) {
    const cleaned = stripFences(text);
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last !== -1) {
      const slice = cleaned.slice(first, last + 1);
      try {
        return JSON.parse(slice) as T;
      } catch {
        // Fall through to the repair pass — the model frequently emits raw
        // newlines inside long prose fields when it was told to use `\n\n`,
        // which JSON.parse rejects but repairJsonString fixes.
        return JSON.parse(repairJsonString(slice)) as T;
      }
    }
  }
  // Fall back to treating the payload itself as the parsed JSON.
  return payload as unknown as T;
}

export async function suggestSteep(args: {
  dimension: 'social' | 'technological' | 'economic' | 'environmental' | 'political';
  companyProfile: string;
  language: 'es' | 'en';
}): Promise<SuggestionItem[]> {
  const { data } = await api.post<AnthropicResponse>('ai/suggest-steep', args);
  const parsed = parseJson<{ factors?: SuggestionItem[] }>(data);
  return parsed.factors ?? [];
}

export async function suggestHorizon(args: {
  horizon: 'H1' | 'H2' | 'H3';
  companyProfile: string;
  language: 'es' | 'en';
}): Promise<SuggestionItem[]> {
  const { data } = await api.post<AnthropicResponse>('ai/suggest-horizon', args);
  const parsed = parseJson<{ signals?: SuggestionItem[] }>(data);
  return parsed.signals ?? [];
}

export type GlobalSteepDimension = keyof GlobalSteep;

export async function globalSteep(args: {
  sector: string;
  language: 'es' | 'en';
  dimension?: GlobalSteepDimension;
}): Promise<Partial<GlobalSteep>> {
  // When `dimension` is set the backend returns a single-key payload
  // (e.g. {"P":"..."}); without it, all five keys come back. The caller
  // merges only the keys it asked for.
  const { data } = await api.post<AnthropicResponse>('ai/global-steep', args);
  return parseJson<Partial<GlobalSteep>>(data);
}

/**
 * Phase 1 of the split Global STEEP flow. Runs ONE web-search call on
 * the backend and returns raw dated bullets for all five dimensions in
 * a single JSON. Pair with {@link globalSteepDim} for the per-dimension
 * reformulation phase (5 parallel calls, no further search).
 */
export async function globalSteepScan(
  args: { sector: string; language: 'es' | 'en' },
  onProgress?: ProgressCallback,
): Promise<{ result: Partial<GlobalSteep>; citations: SourceItem[] }> {
  return streamSse<typeof args, Partial<GlobalSteep>>(
    'ai/global-steep-scan',
    args,
    (text) => parseJsonText<Partial<GlobalSteep>>(text),
    onProgress,
  );
}

/**
 * Phase 2 of the split Global STEEP flow — streamed. No web_search, so
 * the {@code onProgress} callback will only carry character counts
 * (sources stays at 0). The model emits plain prose, so the streaming
 * consumer's parser just trims whitespace + any stray surrounding
 * quotes — there's no JSON envelope to extract.
 *
 * <p>Defensively strips quote characters left over from prompts that
 * accidentally wrap their output (the backend tries hard to avoid this,
 * but the safety net keeps the textareas clean either way).
 */
export async function globalSteepDim(
  args: {
    sector: string;
    language: 'es' | 'en';
    dimension: GlobalSteepDimension;
    snippet: string;
  },
  onProgress?: ProgressCallback,
): Promise<string> {
  const res = await streamSse<typeof args, string>(
    'ai/global-steep-dim',
    args,
    (text) => text.replace(/^["']+|["']+$/g, '').trim(),
    onProgress,
  );
  return res.result;
}

/**
 * 3P scenario as produced by the demo-aligned analyzeScenarios prompt.
 *
 * <p>`type` is the localized 3P token ("Probable" / "Plausible" / "Possible"
 * in English, "Probable" / "Plausible" / "Posible" in Spanish). `name` is the
 * model's evocative title for the scenario — note: the previous flat-shape
 * version of this type used `title`, so consumers reading legacy reports may
 * see one or the other.
 */
export interface Scenario {
  type: string;
  /** Evocative scenario title (matches the demo's `name` field). */
  name?: string;
  /** @deprecated Legacy flat-shape field. New reports populate `name` instead. */
  title?: string;
  /** Probability percentage as a display string, e.g. "72%". The three scenarios in a report sum to 100%. */
  probability?: string;
  description: string;
  opportunities?: string[];
  threats?: string[];
  successFactors?: string[];
  firstMove?: string;
}

export interface AnalyzeReport {
  scenarios?: Scenario[];
  /** New demo-aligned shape: `{title, dimension, description}`. */
  weakSignals?: WeakSignal[];
  /** New demo-aligned shape: `{title, description}`. */
  wildcards?: Wildcard[];
  /** New demo-aligned shape: `{name, description}`. */
  keyUncertainties?: KeyUncertainty[];
  /** 2 short paragraphs separated by `\n\n`. */
  executiveSummary?: string;
  [key: string]: unknown;
}

/* ─── Summary section types (demo-aligned objects, not plain strings) ──── */

export interface KeyUncertainty {
  name: string;
  description: string;
}

/**
 * `dimension` is a localized STEEP dimension name — Spanish: "Social",
 * "Tecnológico", "Económico", "Medioambiental", "Político"; English: "Social",
 * "Technological", "Economic", "Environmental", "Political". Consumers that
 * want to icon-map by dimension should normalize.
 */
export interface WeakSignal {
  title: string;
  dimension: string;
  description: string;
}

export interface Wildcard {
  title: string;
  description: string;
}

/* ─── Scenario-planning types ──────────────────────────────────────────── */

export interface DrivingForce {
  rank: number;
  title: string;
  description: string;
  /** 0-100, strictly descending across the 4 ranked forces. */
  impactScore: number;
}

export interface UncertaintyAxis {
  label: string;
  poleHigh: string;
  poleLow: string;
  rationale: string;
}

export interface ScenarioLogic {
  /** Evocative scenario name matching the corresponding 3P scenario. */
  name: string;
  logic: string;
}

/**
 * Scenario-planning payload. The backend wraps this under a top-level
 * `"scenarioPlanning"` key (matching the demo); {@link analyzeScenarioPlanning}
 * unwraps and returns this inner shape so callers can address fields directly.
 */
export interface ScenarioPlanning {
  intro?: string;
  drivingForces?: DrivingForce[];
  axes?: UncertaintyAxis[];
  scenarioLogics?: ScenarioLogic[];
}

/* ─── Backcasting types ────────────────────────────────────────────────── */

export interface BackcastingMilestone {
  /** Calendar year as a string (e.g. "2031"); supplied by the user-prompt context block. */
  year: string;
  title: string;
  description: string;
  actions?: string[];
}

export interface BackcastingEntry {
  scenarioType: string;
  /** Placeholder name returned by the model; the client patches it with the matching scenario's `name`. */
  scenarioName: string;
  visionStatement: string;
  milestones?: BackcastingMilestone[];
  startingPoint: string;
}

/** Flat array of backcasting trajectories — one per 3P scenario. */
export type Backcasting = BackcastingEntry[];

/* ─── Strategic-priorities types ───────────────────────────────────────── */

export interface StrategicPriority {
  /** "H1" | "H2" | "H3". */
  horizon: string;
  /** Localized timeframe string (e.g. "0-18 meses", "18 meses-2 años") supplied by the user prompt. */
  timeframe: string;
  title: string;
  impact: 'low' | 'medium' | 'high';
  actions?: string[];
}

/**
 * Flat list of strategic priorities, 2 per horizon. The backend returns
 * `{strategicPriorities: [...]}`; {@link analyzeStrategicMap} unwraps so
 * callers receive the array directly.
 */
export type StrategicMap = StrategicPriority[];

/* ─── Sources ──────────────────────────────────────────────────────────── */

export interface SourceItem {
  title: string;
  url: string;
  /**
   * One-sentence rationale supplied by the standalone `/analyze/sources`
   * call. Per-section citation lists (when surfaced) omit it because the
   * web_search tool only provides title + URL.
   */
  description?: string;
}

/**
 * Sources surfaced under the report. The standalone `/analyze/sources`
 * endpoint still returns the flat {@code sources} list, but the demo also
 * groups citations by section (A-E) plus a "Global STEEP" bucket from the
 * step-2 generation. The new fields are optional so this type works for
 * both shapes — the renderer falls back gracefully.
 */
export interface Sources {
  /** Flat list, typically from `/analyze/sources` (no section attribution). */
  sources?: SourceItem[];
  /** Deduped flat list of citations across all section calls. */
  report?: SourceItem[];
  /** Per-section citation buckets, keyed by section id ("A".."E"). */
  bySection?: Partial<Record<'A' | 'B' | 'C' | 'D' | 'E', SourceItem[]>>;
  /** Citations from the Global STEEP generation (step 2). */
  globalSteep?: SourceItem[];
}

interface AnalyzeArgs {
  companyProfile: unknown;
  steep: unknown;
  horizon: unknown;
  /**
   * Shared research bullets gathered by {@link analyzeScan} up front.
   * When present, the 5 section calls fold this verbatim into their
   * user prompt so they can anchor on the same facts and skip their
   * own web_search loop (~5× cheaper end-to-end). Omit on the very
   * first call to {@link analyzeScan} itself — that's the call that
   * produces it.
   */
  research?: string;
  language: 'es' | 'en';
}

export async function analyze(args: AnalyzeArgs): Promise<AnalyzeReport> {
  const { data } = await api.post<AnthropicResponse>('ai/analyze', args);
  return parseJson<AnalyzeReport>(data);
}

/**
 * Shape returned by {@link analyzeSummary} — the section-A half of the
 * parallel analysis (executive summary, uncertainties, weak signals,
 * wildcards). The 3P scenarios are produced by {@link analyzeScenarios} as
 * a sibling call.
 */
export interface AnalyzeSummary {
  executiveSummary?: string;
  keyUncertainties?: KeyUncertainty[];
  weakSignals?: WeakSignal[];
  wildcards?: Wildcard[];
}

/**
 * Companion shape returned by every analyze section call. {@code result}
 * is the parsed JSON the prompt produced; {@code citations} is the
 * deduped list of web_search URLs the model consulted during this turn
 * (empty when web_search returned nothing). NewReportPage aggregates the
 * citations across sections to populate {@link Sources}.
 */
export interface AnalyzeSectionResponse<T> {
  result: T;
  citations: SourceItem[];
}

/**
 * Per-section progress event surfaced to the loader UI.
 *
 * <p>{@code chars} is the running total of characters streamed from the
 * model's text-delta blocks; {@code sources} is the running count of
 * unique URLs harvested from {@code web_search_tool_result} blocks
 * during this section's turn.
 */
export interface AnalyzeProgress {
  chars: number;
  sources: number;
}

export type ProgressCallback = (progress: AnalyzeProgress) => void;

/**
 * Generic SSE consumer for the 5 analyze section endpoints. POSTs the
 * request payload to the streaming endpoint, parses each {@code data:}
 * event the backend emits (see {@code streamSection} on the server),
 * and resolves with the final parsed JSON + collected citations once
 * the {@code done} event arrives.
 *
 * <p>Progress events fire {@code onProgress} synchronously so loader
 * counters tick in real time. The backend throttles them server-side
 * (~5/s) so we don't need additional rate-limiting here.
 *
 * <p>The function uses {@code fetch} (not axios) because axios doesn't
 * stream a response body — it buffers the whole payload before the
 * promise resolves, which would defeat the entire point. Auth is
 * threaded through {@link getAuthToken}.
 */
async function streamAnalyze<T>(
  path: string,
  args: AnalyzeArgs,
  parser: (text: string) => T,
  onProgress?: ProgressCallback,
): Promise<AnalyzeSectionResponse<T>> {
  return streamSse<unknown, T>(path, args, parser, onProgress);
}

/**
 * Generic SSE POST + stream-consume helper. Used by both the analyze
 * section calls and the Step 2 Global STEEP calls — they share the
 * exact same `{type:"progress"|"done", ...}` event envelope, so the
 * consumer is independent of the request payload shape.
 *
 * <p>Resolves with the final parsed result + citations once the stream
 * emits a {@code done} event. Throws clearly when the response isn't
 * SSE or the stream closes empty (proxies that strip Content-Type or
 * connections that drop mid-flight produce diagnosable errors instead
 * of hanging the caller).
 */
async function streamSse<TBody, T>(
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
  // Verbose logs are gated on a localStorage flag so they don't spam
  // every successful generation. Set `localStorage.streamDebug = '1'`
  // in DevTools and re-run to see the play-by-play.
  const debug =
    typeof window !== 'undefined' &&
    (window.localStorage?.getItem('streamDebug') === '1');

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (debug) {
    console.log(`[streamSse] ${url} →`, res.status, res.statusText, {
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
  // If the server didn't respond with SSE, fetch isn't going to honour
  // chunked semantics the way we expect. Bail loud so this kind of
  // misconfiguration (e.g. a reverse proxy stripping the content type)
  // is visible instead of hanging forever.
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

  // SSE frames are separated by a blank line. Spec is LF-LF; some
  // proxies normalise to CRLF-CRLF — match both.
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
      frameCount += 1;
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
      } catch (e) {
        if (debug) console.warn('[streamSse] bad JSON frame', dataLines, e);
        next = splitFrame(buffer);
        continue;
      }
      const evt = payload as
        | { type: 'progress'; chars: number; sources: number }
        | { type: 'done'; text: string; citations: SourceItem[] };
      if (evt.type === 'progress') {
        onProgress?.({ chars: evt.chars ?? 0, sources: evt.sources ?? 0 });
      } else if (evt.type === 'done') {
        finalText = evt.text ?? '';
        citations = Array.isArray(evt.citations) ? evt.citations : [];
      }
      next = splitFrame(buffer);
    }
  }
  if (debug) {
    console.log(`[streamSse] ${url} closed`, {
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

/**
 * Apply the JSON-extract + repair pipeline to a plain text string.
 * Mirrors {@link parseJson} but operates on already-extracted text,
 * which is what the streaming consumer holds after assembling all
 * the text-delta fragments.
 */
function parseJsonText<T>(text: string): T {
  const cleaned = stripFences(text);
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1) {
    // Surface whatever the model actually wrote (capped) so the user
    // sees the real reason — most commonly "I cannot complete this
    // request…", a truncation mid-search, or an empty body when the
    // max_tokens budget was burned on tool_use rounds.
    const preview = cleaned.trim().slice(0, 240);
    const suffix = preview.length === 0 ? ' (empty response)' : ` — got: "${preview}${cleaned.length > 240 ? '…' : ''}"`;
    throw new Error(`No JSON object found in streamed response${suffix}`);
  }
  const slice = cleaned.slice(first, last + 1);
  try {
    return JSON.parse(slice) as T;
  } catch {
    return JSON.parse(repairJsonString(slice)) as T;
  }
}

/**
 * Up-front research pass — runs once before the 5 parallel section
 * calls. Streams a web_search-enabled call that gathers concrete,
 * dated facts about the sector + strategic challenge. The result text
 * (the {@code research} field) and citations are then handed to each
 * of the 5 analyze section calls as their shared context.
 *
 * <p>This is the entry point for the demo's scan-then-analyse pattern
 * applied to the report flow — it cuts total web_search budget from
 * ~25 (5 sections × 5 uses each) down to ~5.
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

/**
 * Phase-A of the parallel-5 analysis flow — executive summary,
 * uncertainties, signals, wildcards. The endpoint now streams progress
 * via SSE; pass {@code onProgress} to receive char + source counts as
 * the model writes.
 */
export async function analyzeSummary(
  args: AnalyzeArgs,
  onProgress?: ProgressCallback,
): Promise<AnalyzeSectionResponse<AnalyzeSummary>> {
  return streamAnalyze(
    'ai/analyze/summary',
    args,
    (text) => parseJsonText<AnalyzeSummary>(text),
    onProgress,
  );
}

/** Phase-B of the parallel-5 analysis flow — the 3P scenarios. */
export async function analyzeScenarios(
  args: AnalyzeArgs,
  onProgress?: ProgressCallback,
): Promise<AnalyzeSectionResponse<{ scenarios?: Scenario[] }>> {
  return streamAnalyze(
    'ai/analyze/scenarios',
    args,
    (text) => parseJsonText<{ scenarios?: Scenario[] }>(text),
    onProgress,
  );
}

/* The three "section" calls below take only AnalyzeArgs — the upstream
 * scenarios input was removed when the analysis flow was reshaped into
 * 5 fully-parallel calls. Each section anchors on Probable/Plausible/
 * Possible types directly, so no coordination is needed at request time;
 * cross-section consistency comes from the universal 3P framing. */

/**
 * Section-C call — the backend's response wraps the payload under a
 * top-level `"scenarioPlanning"` key (matching the demo's JSON contract).
 * We unwrap here so callers can address `result.intro` / `result.drivingForces`
 * directly instead of `result.scenarioPlanning.intro`.
 */
export async function analyzeScenarioPlanning(
  args: AnalyzeArgs,
  onProgress?: ProgressCallback,
): Promise<AnalyzeSectionResponse<ScenarioPlanning>> {
  return streamAnalyze(
    'ai/analyze/scenario-planning',
    args,
    (text) => {
      const parsed = parseJsonText<{ scenarioPlanning?: ScenarioPlanning } & ScenarioPlanning>(text);
      return parsed.scenarioPlanning ?? parsed;
    },
    onProgress,
  );
}

/**
 * Section-E call — the backend returns `{backcasting: [...]}`. We unwrap to
 * the inner array. The caller is responsible for patching each entry's
 * placeholder `scenarioName` with the matching scenario from the 3P set.
 */
export async function analyzeBackcasting(
  args: AnalyzeArgs,
  onProgress?: ProgressCallback,
): Promise<AnalyzeSectionResponse<Backcasting>> {
  return streamAnalyze(
    'ai/analyze/backcasting',
    args,
    (text) => {
      const parsed = parseJsonText<{ backcasting?: Backcasting }>(text);
      return parsed.backcasting ?? [];
    },
    onProgress,
  );
}

/**
 * Section-D call — the backend returns `{strategicPriorities: [...]}`. We
 * unwrap to the inner array (6 entries, 2 per horizon).
 */
export async function analyzeStrategicMap(
  args: AnalyzeArgs,
  onProgress?: ProgressCallback,
): Promise<AnalyzeSectionResponse<StrategicMap>> {
  return streamAnalyze(
    'ai/analyze/strategic-map',
    args,
    (text) => {
      const parsed = parseJsonText<{ strategicPriorities?: StrategicMap }>(text);
      return parsed.strategicPriorities ?? [];
    },
    onProgress,
  );
}

/** Sources doesn't need scenarios — we still accept the same shape so callers
 *  can reuse a single arg object without conditionally trimming fields. */
export async function analyzeSources(args: AnalyzeArgs): Promise<Sources> {
  const { data } = await api.post<AnthropicResponse>('ai/analyze/sources', args);
  return parseJson<Sources>(data);
}

/* ─── Chat assistant ────────────────────────────────────────────────────── */

export interface ChatContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  /** for type === "text" */
  text?: string;
  /** for type === "tool_use" */
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  /** for type === "tool_result" */
  tool_use_id?: string;
  /** Result content. Plain string when the tool returned text; the model also
   *  accepts a list of {type:'text', text} blocks but we keep things simple. */
  content?: string;
  /** Marks tool_results that errored — Anthropic uses this to nudge the model
   *  to recover/retry instead of treating the result as success. */
  is_error?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  /** Strings allowed for plain user text turns; everything else (assistant
   *  output and user tool-result turns) uses the block array form. */
  content: string | ChatContentBlock[];
}

export interface ChatResponse {
  content: ChatContentBlock[];
  /** Anthropic emits "tool_use" when the response ended on a tool call,
   *  "end_turn" when the model is done. We use it to know when to keep
   *  looping vs. when to render the final answer. */
  stop_reason?: string;
}

export async function chat(args: {
  messages: ChatMessage[];
  /** Pre-formatted USER STATE block (see {@link buildAssistantSnapshot}).
   *  The backend stitches it verbatim into the system prompt. */
  context?: string;
  language: 'es' | 'en';
}): Promise<ChatResponse> {
  const { data } = await api.post<ChatResponse>('ai/chat', args);
  return data;
}
