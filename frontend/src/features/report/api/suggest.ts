/**
 * Wizard suggestion endpoints — used by the STEEP and horizon wizard
 * steps to populate the "give me ideas" panels. Each returns a small
 * list of {title, description} cards the user can pick from or use as
 * inspiration for their own input.
 */
import api from '../../../lib/api';
import { parseJson, type AnthropicResponse } from '../../../lib/anthropicJson';
import type { SuggestionItem } from '../../../types/api';

export async function suggestSteep(args: {
  dimension: 'social' | 'technological' | 'economic' | 'environmental' | 'political';
  companyProfile: string;
  language: 'es' | 'en' | 'ca';
}): Promise<SuggestionItem[]> {
  const { data } = await api.post<AnthropicResponse>('ai/suggest-steep', args);
  const parsed = parseJson<{ factors?: SuggestionItem[] }>(data);
  return parsed.factors ?? [];
}

export async function suggestHorizon(args: {
  horizon: 'H1' | 'H2' | 'H3';
  companyProfile: string;
  language: 'es' | 'en' | 'ca';
}): Promise<SuggestionItem[]> {
  const { data } = await api.post<AnthropicResponse>('ai/suggest-horizon', args);
  const parsed = parseJson<{ signals?: SuggestionItem[] }>(data);
  return parsed.signals ?? [];
}
