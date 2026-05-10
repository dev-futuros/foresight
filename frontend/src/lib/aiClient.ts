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

function parseJson<T>(payload: AnthropicResponse): T {
  // Backend may have already returned the parsed JSON shape (e.g. when Claude responds
  // with a single text block we still wrap it in `content`). Try both paths.
  const text = extractText(payload);
  if (text) {
    const cleaned = stripFences(text);
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last !== -1) {
      return JSON.parse(cleaned.slice(first, last + 1)) as T;
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

export interface Scenario {
  type: string;
  title: string;
  description: string;
}

export interface AnalyzeReport {
  scenarios?: Scenario[];
  weakSignals?: string[];
  wildcards?: string[];
  keyUncertainties?: string[];
  [key: string]: unknown;
}

/* ─── F3 — split-analysis downstream payloads ──────────────────────────── */

export interface DrivingForce {
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  uncertainty: 'low' | 'medium' | 'high';
}

export interface UncertaintyAxis {
  name: string;
  negative: string;
  positive: string;
}

export interface ImpactMatrixCell {
  /** Title of the matching DrivingForce. */
  force: string;
  x: number;
  y: number;
}

export interface NarrativeLogic {
  scenarioType: string;
  logic: string;
}

export interface ScenarioPlanning {
  forces?: DrivingForce[];
  axes?: UncertaintyAxis[];
  impactMatrix?: ImpactMatrixCell[];
  narrativeLogics?: NarrativeLogic[];
}

export interface BackcastingMilestone {
  timeframe: string;
  title: string;
  description: string;
  actions?: string[];
}

export interface BackcastingPanel {
  scenarioType: string;
  vision: string;
  milestones?: BackcastingMilestone[];
  now: string;
}

export interface Backcasting {
  panels?: BackcastingPanel[];
}

export interface StrategicMapEntry {
  title: string;
  description: string;
}

export interface StrategicMap {
  h1?: StrategicMapEntry[];
  h2?: StrategicMapEntry[];
  h3?: StrategicMapEntry[];
}

export interface SourceItem {
  title: string;
  url: string;
  description: string;
}

export interface Sources {
  sources?: SourceItem[];
}

interface AnalyzeArgs {
  companyProfile: unknown;
  steep: unknown;
  horizon: unknown;
  language: 'es' | 'en';
}

interface AnalyzeContextArgs extends AnalyzeArgs {
  /** Already-produced 3P scenarios from the base /analyze call. Anchors the
   *  downstream call so the model doesn't reinvent them inconsistently. */
  scenarios: Scenario[];
}

export async function analyze(args: AnalyzeArgs): Promise<AnalyzeReport> {
  const { data } = await api.post<AnthropicResponse>('ai/analyze', args);
  return parseJson<AnalyzeReport>(data);
}

export async function analyzeScenarioPlanning(
  args: AnalyzeContextArgs,
): Promise<ScenarioPlanning> {
  const { data } = await api.post<AnthropicResponse>('ai/analyze/scenario-planning', args);
  return parseJson<ScenarioPlanning>(data);
}

export async function analyzeBackcasting(args: AnalyzeContextArgs): Promise<Backcasting> {
  const { data } = await api.post<AnthropicResponse>('ai/analyze/backcasting', args);
  return parseJson<Backcasting>(data);
}

export async function analyzeStrategicMap(args: AnalyzeContextArgs): Promise<StrategicMap> {
  const { data } = await api.post<AnthropicResponse>('ai/analyze/strategic-map', args);
  return parseJson<StrategicMap>(data);
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
