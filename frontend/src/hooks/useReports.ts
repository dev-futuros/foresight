import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getAuthToken } from '../lib/api';
import type {
  CreateReportRequest,
  Page,
  ReportResponse,
  ReportSummary,
  TranslatedReport,
  UpdateReportRequest,
} from '../types/api';

/**
 * Progress event surfaced from the streaming translate endpoint while
 * the model is writing. {@code outputChars / inputChars} is roughly
 * 0..1 and drives the determinate progress bar in the share/export
 * dialogs (the translated envelope ends up about the same length as
 * the source).
 */
export interface TranslateProgress {
  inputChars: number;
  outputChars: number;
}

export function useReports(page = 0, size = 20) {
  return useQuery<Page<ReportSummary>>({
    queryKey: ['reports', page, size],
    queryFn: async () => {
      const res = await api.get<Page<ReportSummary>>('/reports', {
        params: { page, size, sort: 'createdAt,desc' },
      });
      return res.data;
    },
  });
}

export function useReport(id: string) {
  return useQuery<ReportResponse>({
    queryKey: ['reports', id],
    queryFn: async () => {
      const res = await api.get<ReportResponse>(`/reports/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateReportRequest) => {
      const res = await api.post<ReportResponse>('/reports', body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
}

export function useUpdateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateReportRequest }) => {
      const res = await api.patch<ReportResponse>(`/reports/${id}`, body);
      return res.data;
    },
    onSuccess: (data) => {
      qc.setQueryData(['reports', data.id], data);
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/reports/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
}

/**
 * Translate a report into a target language. Cached per (report ×
 * language) on the backend — the first call for a given pair takes
 * 10-30s, subsequent calls return the stored payload instantly. The
 * mutation also refreshes the report detail cache so the new
 * `availableLanguages` entry shows up immediately in any open dialog.
 *
 * <p>{@code force} bypasses the backend cache and re-translates — use
 * when the report has been edited since the translation was generated.
 */
/**
 * Drop a cached translation from a report. Backend is idempotent (no-op
 * when the language isn't materialised) and refuses to delete the
 * primary language. On success the dashboard list is invalidated so the
 * chip flips back to `+ EN`.
 */
export function useDeleteTranslation() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; language: 'es' | 'en' }>({
    mutationFn: async ({ id, language }) => {
      await api.delete(`/reports/${id}/translations/${language}`);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.invalidateQueries({ queryKey: ['reports', vars.id] });
    },
  });
}

export function useTranslateReport() {
  const qc = useQueryClient();
  return useMutation<
    TranslatedReport,
    Error,
    { id: string; targetLanguage: 'es' | 'en'; force?: boolean }
  >({
    mutationFn: async ({ id, targetLanguage, force = false }) => {
      const res = await api.post<TranslatedReport>(
        `/reports/${id}/translate`,
        null,
        { params: { targetLanguage, force } },
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      // The report row's availableLanguages list grew; the next time
      // the dialog opens it should show the new language as cached.
      qc.invalidateQueries({ queryKey: ['reports', vars.id] });
    },
  });
}

/**
 * Streaming variant of {@link useTranslateReport}. Opens an SSE
 * connection to the backend and surfaces {@code progress} events to
 * {@code onProgress} as the translation streams in. Resolves with the
 * final {@code TranslatedReport} once the {@code done} event lands;
 * rejects if the stream closes before completion or the backend errors.
 *
 * <p>This is a low-level helper (not a React hook) so it can be called
 * from anywhere — including the export flow on {@code ReportPage}.
 * Callers that want React Query cache invalidation should still hit
 * the {@code useTranslateReport} mutation; this function is for the
 * progress-bar path where we want to render character-level progress.
 */
export async function translateReportStream(args: {
  id: string;
  targetLanguage: 'es' | 'en';
  force?: boolean;
  onProgress?: (progress: TranslateProgress) => void;
  signal?: AbortSignal;
}): Promise<TranslatedReport> {
  const { id, targetLanguage, force = false, onProgress, signal } = args;
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url =
    `/api/reports/${encodeURIComponent(id)}/translate/stream` +
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
          inputChars: evt.inputChars ?? 0,
          outputChars: evt.outputChars ?? 0,
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
