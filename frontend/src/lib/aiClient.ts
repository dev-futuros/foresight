import api from './api';

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

interface AnthropicWebSearchResult {
  type: 'web_search_result';
  url: string;
  title?: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  /** Present on `web_search_tool_result` blocks — an array of search results. */
  content?: AnthropicWebSearchResult[];
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

/**
 * Walks an Anthropic response and surfaces the unique {url, title} pairs
 * from any `web_search_tool_result` content blocks the model produced
 * during this turn. Mirrors the demo's SSE-stream citation collector, but
 * runs against the materialised response after our backend has proxied
 * the call.
 *
 * <p>Each `web_search_tool_result` block carries an inner `content` array
 * of `web_search_result` items. We dedupe by URL — the same source often
 * surfaces across multiple search calls within a single Anthropic turn.
 */
export function extractCitations(payload: AnthropicResponse): SourceItem[] {
  if (!payload?.content) return [];
  const seen = new Map<string, SourceItem>();
  for (const block of payload.content) {
    if (block.type !== 'web_search_tool_result') continue;
    const items = Array.isArray(block.content) ? block.content : [];
    for (const item of items) {
      if (!item || item.type !== 'web_search_result' || !item.url) continue;
      if (!seen.has(item.url)) {
        seen.set(item.url, { url: item.url, title: item.title ?? item.url });
      }
    }
  }
  return Array.from(seen.values());
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
export async function globalSteepScan(args: {
  sector: string;
  language: 'es' | 'en';
}): Promise<Partial<GlobalSteep>> {
  const { data } = await api.post<AnthropicResponse>('ai/global-steep-scan', args);
  return parseJson<Partial<GlobalSteep>>(data);
}

/**
 * Phase 2 of the split Global STEEP flow. Takes one dimension's raw
 * bullets (from {@link globalSteepScan}) and returns 2-3 sentences of
 * polished prose. No web search, so the call is fast and cheap — the
 * client runs five of these in parallel.
 *
 * <p>Defensively strips quote characters left over from prompts that
 * accidentally wrap their output (the backend tries hard to avoid this,
 * but the safety net keeps the textareas clean either way).
 */
export async function globalSteepDim(args: {
  sector: string;
  language: 'es' | 'en';
  dimension: GlobalSteepDimension;
  snippet: string;
}): Promise<string> {
  const { data } = await api.post<AnthropicResponse>('ai/global-steep-dim', args);
  return extractText(data).replace(/^["']+|["']+$/g, '').trim();
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

async function callAnalyze<T>(
  path: string,
  args: AnalyzeArgs,
  parser: (data: AnthropicResponse) => T,
): Promise<AnalyzeSectionResponse<T>> {
  const { data } = await api.post<AnthropicResponse>(path, args);
  return { result: parser(data), citations: extractCitations(data) };
}

/** Phase-A of the parallel-5 analysis flow — executive summary,
 *  uncertainties, signals, wildcards. Returns citations from this section's
 *  web_search calls alongside the parsed JSON. */
export async function analyzeSummary(
  args: AnalyzeArgs,
): Promise<AnalyzeSectionResponse<AnalyzeSummary>> {
  return callAnalyze('ai/analyze/summary', args, (d) => parseJson<AnalyzeSummary>(d));
}

/** Phase-B of the parallel-5 analysis flow — the 3P scenarios. */
export async function analyzeScenarios(
  args: AnalyzeArgs,
): Promise<AnalyzeSectionResponse<{ scenarios?: Scenario[] }>> {
  return callAnalyze('ai/analyze/scenarios', args, (d) =>
    parseJson<{ scenarios?: Scenario[] }>(d),
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
): Promise<AnalyzeSectionResponse<ScenarioPlanning>> {
  return callAnalyze('ai/analyze/scenario-planning', args, (d) => {
    const parsed = parseJson<{ scenarioPlanning?: ScenarioPlanning } & ScenarioPlanning>(d);
    return parsed.scenarioPlanning ?? parsed;
  });
}

/**
 * Section-E call — the backend returns `{backcasting: [...]}`. We unwrap to
 * the inner array. The caller is responsible for patching each entry's
 * placeholder `scenarioName` with the matching scenario from the 3P set.
 */
export async function analyzeBackcasting(
  args: AnalyzeArgs,
): Promise<AnalyzeSectionResponse<Backcasting>> {
  return callAnalyze('ai/analyze/backcasting', args, (d) => {
    const parsed = parseJson<{ backcasting?: Backcasting }>(d);
    return parsed.backcasting ?? [];
  });
}

/**
 * Section-D call — the backend returns `{strategicPriorities: [...]}`. We
 * unwrap to the inner array (6 entries, 2 per horizon).
 */
export async function analyzeStrategicMap(
  args: AnalyzeArgs,
): Promise<AnalyzeSectionResponse<StrategicMap>> {
  return callAnalyze('ai/analyze/strategic-map', args, (d) => {
    const parsed = parseJson<{ strategicPriorities?: StrategicMap }>(d);
    return parsed.strategicPriorities ?? [];
  });
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
