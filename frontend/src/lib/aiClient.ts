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

export async function globalSteep(args: {
  sector: string;
  language: 'es' | 'en';
}): Promise<GlobalSteep> {
  const { data } = await api.post<AnthropicResponse>('ai/global-steep', args);
  return parseJson<GlobalSteep>(data);
}
