import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  useChat,
  type ChatMessageView,
  type PendingCommand,
} from '../../hooks/useChat';
import { useAssistantContext } from './AssistantContextProvider';
import {
  buildAssistantSnapshot,
  type AssistantSnapshotInput,
} from '../../lib/buildAssistantSnapshot';
import { dispatch as dispatchCommand } from '../../lib/commandBus';
import { setAssistantNotifier, setAssistantResetter } from '../../lib/assistantBridge';
import api from '../../lib/api';
import type { EmpresaData } from '../report/steps/StepEmpresa';
import type { GlobalSteepData } from '../report/steps/StepGlobal';
import type { SteepData } from '../report/steps/StepSteep';
import type { HorizonData } from '../report/steps/StepHorizon';
import type { ExampleSummary, Page, ReportSummary } from '../../types/api';
import './chat.css';

/** Field ID → wizard step it lives on. Used by single-chip clicks to pre-
 *  navigate so the user actually sees the field flash before its value is
 *  written. Apply-all bypasses this — no ping-pong across steps. */
const STEP_FOR_FIELD_ID: Record<string, number> = {
  'f-name': 1, 'f-sector': 1, 'f-size': 1, 'f-horizon': 1, 'f-market': 1,
  'f-challenge': 1, 'f-strengths': 1, 'f-consultant-name': 1, 'f-consultant-company': 1,
  'gs-s': 2, 'gs-t': 2, 'gs-e': 2, 'gs-env': 2, 'gs-p': 2,
  'steep-s': 3, 'steep-t': 3, 'steep-e': 3, 'steep-env': 3, 'steep-p': 3,
  'hs-h1': 4, 'hs-h2': 4, 'hs-h3': 4,
};

/** setField field ids → translation key for the human-readable label. */
const FIELD_NAME_KEY: Record<string, string> = {
  'f-name': 'chat.fields.f-name',
  'f-sector': 'chat.fields.f-sector',
  'f-size': 'chat.fields.f-size',
  'f-horizon': 'chat.fields.f-horizon',
  'f-market': 'chat.fields.f-market',
  'f-challenge': 'chat.fields.f-challenge',
  'f-strengths': 'chat.fields.f-strengths',
  'f-consultant-name': 'chat.fields.f-consultant-name',
  'f-consultant-company': 'chat.fields.f-consultant-company',
  'gs-s': 'chat.fields.gs-s',
  'gs-t': 'chat.fields.gs-t',
  'gs-e': 'chat.fields.gs-e',
  'gs-env': 'chat.fields.gs-env',
  'gs-p': 'chat.fields.gs-p',
  'steep-s': 'chat.fields.steep-s',
  'steep-t': 'chat.fields.steep-t',
  'steep-e': 'chat.fields.steep-e',
  'steep-env': 'chat.fields.steep-env',
  'steep-p': 'chat.fields.steep-p',
  'hs-h1': 'chat.fields.hs-h1',
  'hs-h2': 'chat.fields.hs-h2',
  'hs-h3': 'chat.fields.hs-h3',
};

/** Min character length at which a setField proposal gets a "Show more"
 *  toggle. Below this the preview fits within the line-clamp anyway. */
const PREVIEW_TOGGLE_THRESHOLD = 120;

/** Delay between firing the pre-navigation goTo and resolving the chip.
 *  Long enough for the user to see the destination step flash. */
const PRE_NAV_DELAY_MS = 280;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Tiny inline-markdown pass: {@code **bold**}, {@code *italic*},
 *  {@code `code`}. Anything else passes through as escaped text. */
function renderInlineMd(text: string): string {
  let h = escapeHtml(text);
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  return h;
}

interface PublishedWizardContext {
  currentStep?: number;
  empresa?: EmpresaData;
  globalSteep?: GlobalSteepData;
  steep?: SteepData;
  horizon?: HorizonData;
  /** Set by the report viewer (and the wizard's edit mode) so the
   *  assistant can resolve "this report" / "export this" without the
   *  user naming an id. Absent on every other route. */
  viewingReport?: AssistantSnapshotInput['viewingReport'];
  /** Set by the report viewer alongside viewingReport so the snapshot
   *  can surface the generated content. */
  reportResult?: AssistantSnapshotInput['reportResult'];
}

const EMPTY_EMPRESA: EmpresaData = {
  name: '', sector: '', size: '', horizon: '', market: '',
  challenge: '', strengths: '', consultantName: '', consultantCompany: '', title: '',
};
const EMPTY_GLOBAL_STEEP: GlobalSteepData = { S: '', T: '', E: '', ENV: '', P: '' };
const EMPTY_STEEP: SteepData = {
  social: '', technological: '', economic: '', environmental: '', political: '',
};
const EMPTY_HORIZON: HorizonData = { H1: '', H2: '', H3: '' };

/**
 * Floating chat assistant. Mounted once at the AppShell level; conversation
 * state is owned by {@link useChat} and reset only on explicit user action.
 *
 * <p>The assistant emits commands as inline `<command>` tags (one reply can
 * batch N of them). The renderer surfaces them as pending chips that the
 * user resolves individually or via Apply All. The prose AFTER the chip
 * block stays hidden until all pending chips are resolved — keeps lines
 * like "All set" or "Ready to move to step 2?" from appearing before the
 * action has actually happened.
 */
export default function ChatAssistant() {
  const { t, i18n } = useTranslation();
  const ctx = useAssistantContext() as PublishedWizardContext | undefined;
  const language: 'es' | 'en' | 'ca' = (() => {
    const code = i18n.language?.slice(0, 2);
    if (code === 'en') return 'en';
    if (code === 'ca') return 'ca';
    return 'es';
  })();
  const location = useLocation();

  const {
    messages,
    pending,
    error,
    send,
    notify,
    resolveCommand,
    applyAllInMessage,
    reset,
    resetContext,
  } = useChat();

  const [open, setOpen] = useState(false);
  // Panel width — owned here, applied to the document root as `--chat-w`
  // so both .chat-panel and the shell's margin-right read the same value.
  // Defaults to 380px (matches the original hardcoded width); persists to
  // localStorage so a user's preferred width survives reloads. Clamped to
  // the viewport on every change so it never spills off-screen or shrinks
  // below the readable minimum.
  const [chatWidth, setChatWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 380;
    const raw = window.localStorage?.getItem('fs_chat_width');
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(n) ? n : 380;
  });
  const [resizing, setResizing] = useState(false);
  // Count of assistant messages received while the panel was closed —
  // shown as a pulse badge on the edge button so wizard-triggered
  // notifications (e.g. Global STEEP finished generating) don't go
  // unnoticed when the user has the chat collapsed. Cleared the moment
  // the user opens the panel.
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);

  const { data: reportsPage } = useQuery<Page<ReportSummary>>({
    queryKey: ['reports', 0, 20],
    queryFn: async () => {
      const res = await api.get<Page<ReportSummary>>('/reports', {
        params: { page: 0, size: 20, sort: 'createdAt,desc' },
      });
      return res.data;
    },
    enabled: open,
  });
  // Examples list — same opening trigger as reports. The list is global
  // (every user sees the same set) so the query key has no per-user
  // component. Surfaced into the assistant snapshot so the model can
  // answer "load the bakery example" without asking for an id.
  const { data: examplesList } = useQuery<ExampleSummary[]>({
    queryKey: ['examples'],
    queryFn: async () => {
      const res = await api.get<ExampleSummary[]>('/examples');
      return res.data;
    },
    enabled: open,
  });

  const snapshotInput: AssistantSnapshotInput = {
    language,
    currentStep: ctx?.currentStep ?? 1,
    dashboardOpen: location.pathname === '/dashboard',
    empresa: ctx?.empresa ?? EMPTY_EMPRESA,
    globalSteep: ctx?.globalSteep ?? EMPTY_GLOBAL_STEEP,
    steep: ctx?.steep ?? EMPTY_STEEP,
    horizon: ctx?.horizon ?? EMPTY_HORIZON,
    reports: reportsPage?.content,
    examples: examplesList,
    viewingReport: ctx?.viewingReport,
    reportResult: ctx?.reportResult,
  };
  const snapshot = useMemo(
    () => buildAssistantSnapshot(snapshotInput),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      language,
      snapshotInput.currentStep,
      snapshotInput.dashboardOpen,
      snapshotInput.empresa,
      snapshotInput.globalSteep,
      snapshotInput.steep,
      snapshotInput.horizon,
      snapshotInput.viewingReport,
      snapshotInput.reportResult,
      reportsPage,
      examplesList,
    ],
  );

  // Stash the current snapshot + language in a ref so the assistantBridge
  // handler (registered once on mount) always reads the latest values
  // without forcing a re-register on every wizard-state change. This lets
  // the wizard fire a notification at any moment with an up-to-date
  // user-state block in the system prompt.
  const snapshotRef = useRef<{ context: string; language: 'es' | 'en' | 'ca' }>({
    context: snapshot,
    language,
  });
  snapshotRef.current = { context: snapshot, language };

  useEffect(() => {
    setAssistantNotifier((note) => {
      void notify(note, snapshotRef.current);
    });
    return () => setAssistantNotifier(null);
  }, [notify]);

  // When the user starts a new report (or loads a different one), the
  // chat's API context should reset so the assistant doesn't keep
  // reasoning about the previous brief. Visible message history STAYS
  // on screen — wiping it entirely would be jarring; the user might
  // want to scroll back and reread the prior conversation. resetContext
  // just bumps the cursor so future API calls only include post-reset
  // turns.
  useEffect(() => {
    setAssistantResetter(() => {
      resetContext();
    });
    return () => setAssistantResetter(null);
  }, [resetContext]);

  // Catch cross-report transitions that bypass the chat command bus
  // (clicking a dashboard card, browser back/forward, deep link). The
  // newReport/loadReport handlers call resetAssistant() explicitly, but
  // UI navigation doesn't — so we watch viewingReport.id and reset on
  // transitions BETWEEN defined ids (A → B). A → undefined is left
  // alone: the user may be just popping out to the dashboard and we
  // don't want to wipe context for that.
  const prevReportIdRef = useRef<string | undefined>(undefined);
  const currentReportId = ctx?.viewingReport?.id;
  useEffect(() => {
    const prev = prevReportIdRef.current;
    if (prev && currentReportId && prev !== currentReportId) {
      resetContext();
    }
    if (currentReportId) {
      prevReportIdRef.current = currentReportId;
    }
  }, [currentReportId, resetContext]);

  // ── Resize handle: apply width to :root, clamp, persist ──
  // The CSS reads --chat-w for both the panel width and the shell's
  // margin-right, so writing it here keeps both in sync without prop-
  // drilling into shell.css. Min 320px (still readable), max 760px
  // (twice the default), additionally clamped to the viewport so a
  // saved width doesn't spill off-screen on a narrow window.
  const clampWidth = useCallback((w: number) => {
    if (typeof window === 'undefined') return w;
    const min = 320;
    const max = Math.min(760, Math.max(min, window.innerWidth - 320));
    return Math.min(Math.max(w, min), max);
  }, []);
  useEffect(() => {
    const clamped = clampWidth(chatWidth);
    document.documentElement.style.setProperty('--chat-w', `${clamped}px`);
    if (clamped !== chatWidth) setChatWidth(clamped);
    try {
      window.localStorage?.setItem('fs_chat_width', String(clamped));
    } catch {
      /* private-browsing / storage-disabled — no-op. */
    }
  }, [chatWidth, clampWidth]);
  // Re-clamp on window resize so a previously-saved width that no
  // longer fits the viewport snaps back into range.
  useEffect(() => {
    function onResize() {
      setChatWidth((w) => clampWidth(w));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampWidth]);

  // Drag-to-resize. mousedown on the handle attaches mousemove + mouseup
  // listeners on window so the drag survives the cursor wandering off
  // the narrow handle column. The panel's width = window.innerWidth -
  // pointerX (the chat is anchored to the right edge, so moving the
  // cursor left grows the panel).
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setResizing(true);
      // Lock global selection + cursor while dragging so the pointer
      // doesn't paint a selection across the main content and the
      // ew-resize cursor stays consistent even when the pointer
      // wanders off the narrow handle column. The body class also
      // tells shell.css to disable its margin-right transition so the
      // main content tracks the cursor without easing lag.
      const prevSelect = document.body.style.userSelect;
      const prevCursor = document.body.style.cursor;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
      document.body.classList.add('chat-resizing');
      function onMove(ev: MouseEvent) {
        setChatWidth(clampWidth(window.innerWidth - ev.clientX));
      }
      function onUp() {
        setResizing(false);
        document.body.style.userSelect = prevSelect;
        document.body.style.cursor = prevCursor;
        document.body.classList.remove('chat-resizing');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [clampWidth],
  );

  // Track newly-arrived assistant messages while the panel is closed and
  // surface the count as a badge on the edge button. We watch the length
  // of visible (non-hidden) messages — every increment while closed means
  // the assistant has something new to show.
  const visibleAssistantCount = useMemo(
    () =>
      messages.filter(
        (m) => !m.hidden && m.message.role === 'assistant',
      ).length,
    [messages],
  );
  const lastSeenAssistantCountRef = useRef(visibleAssistantCount);
  useEffect(() => {
    if (open) {
      setUnread(0);
      lastSeenAssistantCountRef.current = visibleAssistantCount;
      return;
    }
    const prev = lastSeenAssistantCountRef.current;
    if (visibleAssistantCount > prev) {
      setUnread((u) => u + (visibleAssistantCount - prev));
      lastSeenAssistantCountRef.current = visibleAssistantCount;
    }
  }, [visibleAssistantCount, open]);

  useEffect(() => {
    if (!open) return;
    const node = msgsRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, pending, open]);

  useEffect(() => {
    if (open && !pending) {
      inputRef.current?.focus();
    }
  }, [open, pending]);

  useEffect(() => {
    if (open) {
      document.body.classList.add('chat-open');
      return () => document.body.classList.remove('chat-open');
    }
  }, [open]);

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  function suggestionBucket(): string {
    const path = location.pathname;
    if (path === '/dashboard') return 'dashboard';
    if (path.startsWith('/share/')) return 'report';
    if (path === '/reports/new' || /^\/reports\/[^/]+\/edit$/.test(path)) {
      const step = ctx?.currentStep ?? 1;
      if (step >= 1 && step <= 4) return `s${step}`;
      return 'default';
    }
    if (/^\/reports\/[^/]+$/.test(path)) return 'report';
    return 'default';
  }

  const suggestions = useMemo<string[]>(() => {
    const bucket = suggestionBucket();
    const raw = t(`chat.suggested.${bucket}`, {
      returnObjects: true,
      defaultValue: [],
    });
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === 'string');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, language, location.pathname, ctx?.currentStep]);

  function onSubmit() {
    if (!draft.trim() || pending) return;
    send(draft, { context: snapshot, language });
    setDraft('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }

  /**
   * Approve a single chip. For setField chips targeting a different wizard
   * step than the user is currently on, dispatch goTo first so the user
   * sees the destination flash before its value is written.
   */
  const handleApproveChip = useCallback(
    async (messageIdx: number, cmd: PendingCommand) => {
      if (cmd.name === 'setField') {
        const fieldId = (cmd.args as { id?: unknown }).id;
        if (typeof fieldId === 'string') {
          const targetStep = STEP_FOR_FIELD_ID[fieldId];
          const currentStep = ctx?.currentStep ?? 0;
          if (targetStep && targetStep !== currentStep) {
            try {
              await dispatchCommand('goTo', { step: targetStep });
              await new Promise((r) => setTimeout(r, PRE_NAV_DELAY_MS));
            } catch {
              // Swallow goTo failures (e.g. step 5 is blocked); the apply
              // still proceeds, the user just doesn't see the flash.
            }
          }
        }
      }
      await resolveCommand(messageIdx, cmd.id, true);
    },
    [ctx?.currentStep, resolveCommand],
  );

  return (
    <>
      {!open && (
        <button
          type="button"
          className={`chat-edge${unread > 0 ? ' has-unread' : ''}`}
          aria-label={t('chat.openAria')}
          title={t('chat.openTitle')}
          onClick={() => setOpen(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12z" />
          </svg>
          {unread > 0 && (
            <span className="chat-edge-badge" aria-hidden>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      )}

      <aside
        className={`chat-panel${open ? ' open' : ''}${resizing ? ' resizing' : ''}`}
        role="dialog"
        aria-label={t('chat.title')}
        aria-hidden={!open}
      >
        {/* Drag handle for horizontal resize. Sits on the panel's left
            edge — pointer becomes ew-resize, mousedown starts the drag.
            Hidden on mobile (full-width panel) via media query. */}
        <div
          className="chat-resize"
          onMouseDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('chat.resize', { defaultValue: 'Resize chat panel' })}
        />
        <header className="chat-head">
          <div className="chat-head-icon" aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5L12 2z" />
            </svg>
          </div>
          <div className="chat-head-text">
            <div className="chat-head-title">{t('chat.title')}</div>
          </div>
          <button
            type="button"
            className="chat-head-btn"
            onClick={reset}
            title={t('chat.reset')}
            aria-label={t('chat.reset')}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
            </svg>
          </button>
          <button
            type="button"
            className="chat-head-btn chat-head-close"
            onClick={() => setOpen(false)}
            title={t('chat.close')}
            aria-label={t('chat.close')}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </header>

        <div className="chat-msgs" ref={msgsRef}>
          {messages.filter((m) => !m.hidden).length === 0 && (
            <div className="chat-empty">
              <p>{t('chat.intro')}</p>
              {suggestions.length > 0 && (
                <div className="chat-suggested" role="list">
                  {suggestions.map((q) => (
                    <button
                      key={q}
                      type="button"
                      role="listitem"
                      className="chat-suggest"
                      onClick={() => {
                        if (pending) return;
                        send(q, { context: snapshot, language });
                      }}
                      disabled={pending}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {messages.map((m, i) =>
            m.hidden ? null : (
              <MessageView
                key={i}
                view={m}
                messageIdx={i}
                ctx={ctx}
                onApproveChip={handleApproveChip}
                onApplyAll={applyAllInMessage}
              />
            ),
          )}
          {pending && (
            <div className="chat-msg bot">
              <div className="chat-typing" aria-label={t('chat.typing')}>
                <span /><span /><span />
              </div>
            </div>
          )}
          {error && (
            <div className="chat-msg bot">
              <div className="chat-bubble-text chat-bubble-error">{error}</div>
            </div>
          )}
        </div>

        <form
          className="chat-input-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={1}
            value={draft}
            placeholder={t('chat.placeholder')}
            onChange={(e) => {
              setDraft(e.target.value);
              autosize(e.currentTarget);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            disabled={pending}
          />
          <button
            type="submit"
            className="chat-send"
            aria-label={t('chat.send')}
            disabled={pending || !draft.trim()}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </button>
        </form>
        <div className="chat-foot">{t('chat.disclaimer')}</div>
      </aside>
    </>
  );
}

interface MessageViewProps {
  view: ChatMessageView;
  messageIdx: number;
  /** Current wizard context — read by chips that compute state-aware
   *  labels (e.g. goTo to step 2 says "Generate Global STEEP" when the
   *  GS fields are empty, "Navigate to step 2" otherwise). */
  ctx: PublishedWizardContext | undefined;
  onApproveChip: (messageIdx: number, cmd: PendingCommand) => void | Promise<void>;
  onApplyAll: (messageIdx: number) => void | Promise<void>;
}

type ApplyAllState = 'idle' | 'running' | 'done';

/**
 * Renders one assistant or user turn. User content goes in a plain bubble.
 *
 * <p>Assistant turns with parsed commands render the pre-chip prose first,
 * then the chips themselves (each clickable to approve), then an Apply All
 * button when 2+ chips are still pending, and finally — only once nothing
 * is pending — the post-chip prose.
 */
function MessageView({ view, messageIdx, ctx, onApproveChip, onApplyAll }: MessageViewProps) {
  const { t } = useTranslation();
  const [applyAllState, setApplyAllState] = useState<ApplyAllState>('idle');
  const { message, commands, segments } = view;

  if (typeof message.content === 'string') {
    const isBot = message.role !== 'user';
    return (
      <div className={`chat-msg ${isBot ? 'bot' : 'user'}`}>
        {isBot ? (
          <div
            className="chat-bubble-text"
            dangerouslySetInnerHTML={{ __html: renderInlineMd(message.content) }}
          />
        ) : (
          <div className="chat-bubble-text">{message.content}</div>
        )}
      </div>
    );
  }

  // Block-array assistant turn. We split prose into pre/post around the
  // chip block; commands are the parsed-out tags awaiting the user.
  const pre = segments?.pre ?? '';
  const post = segments?.post ?? '';
  const hasCommands = !!commands && commands.length > 0;
  const pendingCount = commands?.filter((c) => c.status === 'pending').length ?? 0;
  const allResolved = hasCommands && pendingCount === 0;
  // While the assistant is still streaming, chips are visible but NOT
  // interactive — the user shouldn't approve the first one before the
  // tail arrives, and "Apply all" is hidden so it can't fire on a
  // partial set. Once the stream completes, both unlock.
  const isStreaming = view.streaming === true;
  const showApplyAll =
    !isStreaming && (applyAllState !== 'idle' || pendingCount >= 2);

  async function handleApplyAll() {
    if (applyAllState !== 'idle') return;
    setApplyAllState('running');
    await onApplyAll(messageIdx);
    setApplyAllState('done');
  }

  return (
    <div className={`chat-msg ${message.role === 'user' ? 'user' : 'bot'}`}>
      {pre && (
        <div
          className="chat-bubble-text"
          dangerouslySetInnerHTML={{ __html: renderInlineMd(pre) }}
        />
      )}
      {hasCommands && (
        <div className="chat-applied-list">
          {commands!.map((cmd) => (
            <CommandChip
              key={cmd.id}
              cmd={cmd}
              ctx={ctx}
              streaming={isStreaming}
              onApprove={() => onApproveChip(messageIdx, cmd)}
            />
          ))}
        </div>
      )}
      {showApplyAll && (
        <button
          type="button"
          className={`chat-apply-all${applyAllState === 'done' || allResolved ? ' done' : ''}`}
          onClick={handleApplyAll}
          disabled={applyAllState !== 'idle' || pendingCount === 0}
        >
          {applyAllState === 'done' || allResolved
            ? t('chat.applyAllDone')
            : t('chat.applyAll')}
        </button>
      )}
      {allResolved && post && (
        <div
          className="chat-bubble-text chat-bubble-post"
          dangerouslySetInnerHTML={{ __html: renderInlineMd(post) }}
        />
      )}
    </div>
  );
}

/**
 * One chip per parsed `<command>` tag. Renders as a clickable confirm card
 * while pending; transitions to green "applied", red "error", or muted
 * "declined" once resolved. The whole card is the click target — there's
 * no separate confirm button.
 *
 * <p>Some chip labels are state-aware: goTo(step:2) reads "Generate Global
 * STEEP" when the GS fields are empty (because navigating there auto-runs
 * generation) and "Navigate to step 2" otherwise. Mirrors the wizard's
 * SplitButton primary-action logic so users see the same label in both
 * places.
 */
function CommandChip({
  cmd,
  ctx,
  streaming,
  onApprove,
}: {
  cmd: PendingCommand;
  ctx: PublishedWizardContext | undefined;
  /** True while the parent message is still being streamed. A streaming
   *  chip is rendered as a placeholder — visible so the user can see the
   *  proposals arriving, but not interactive. Once streaming finishes the
   *  chip becomes a normal clickable confirm. */
  streaming: boolean;
  onApprove: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const isSetField = cmd.name === 'setField';
  const args = cmd.args as { id?: string; mode?: string; value?: string };
  const fieldId = args.id ?? '';
  const fieldKey = isSetField ? FIELD_NAME_KEY[fieldId] : undefined;
  const fieldName = fieldKey ? t(fieldKey) : fieldId;
  const preview = isSetField ? args.value ?? '' : '';
  const showToggle = preview.length >= PREVIEW_TOGGLE_THRESHOLD;

  const stateClass =
    cmd.status === 'applied'
      ? ' applied'
      : cmd.status === 'error'
        ? ' applied error'
        : cmd.status === 'declined'
          ? ' declined'
          : '';
  // Only pending chips on a finished message are clickable. While the
  // message is still streaming we keep the chip visible (so the user
  // sees proposals arrive in order) but block interaction so they can't
  // approve a single one before the full set has been delivered.
  const clickable = cmd.status === 'pending' && !streaming;
  const streamingClass = streaming && cmd.status === 'pending' ? ' streaming' : '';

  const headText = (() => {
    if (isSetField) {
      const verb =
        cmd.status === 'applied'
          ? t('chat.appliedTo')
          : cmd.status === 'error'
            ? t('chat.failedTo', { defaultValue: 'Failed' })
            : cmd.status === 'declined'
              ? t('chat.appliedTo')
              : args.mode === 'add'
                ? t('chat.addTo')
                : t('chat.replaceIn');
      return `${verb}: ${fieldName}`;
    }
    // State-aware override for goTo(step:2): when the Global STEEP fields
    // are empty, navigating there will auto-trigger generation, so the
    // chip surfaces that — matching the wizard's SplitButton primary
    // label. With data already present it's just navigation.
    if (cmd.name === 'goTo') {
      const goArgs = cmd.args as { step?: number };
      if (goArgs.step === 2) {
        const gs = ctx?.globalSteep;
        const hasGs = !!gs && (
          (gs.S?.trim() ?? '') !== '' ||
          (gs.T?.trim() ?? '') !== '' ||
          (gs.E?.trim() ?? '') !== '' ||
          (gs.ENV?.trim() ?? '') !== '' ||
          (gs.P?.trim() ?? '') !== ''
        );
        if (!hasGs) return t('chat.cmdLabels.generateGlobalSteep');
      }
      // Other steps: append step number for clarity ("Navigate to step 4").
      if (typeof goArgs.step === 'number') {
        return t('chat.cmdLabels.goToStep', {
          step: goArgs.step,
          defaultValue: `${t('chat.cmdLabels.goTo')} → ${goArgs.step}`,
        });
      }
    }
    const labelKey = `chat.cmdLabels.${cmd.name}`;
    return t(labelKey, { defaultValue: cmd.name });
  })();

  function handleClick() {
    if (!clickable) return;
    void onApprove();
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!clickable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void onApprove();
    }
  }

  return (
    <div
      className={`chat-confirm${stateClass}${streamingClass}${expanded ? ' expanded' : ''}`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : -1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={headText}
      aria-disabled={!clickable || undefined}
    >
      <div className="chat-confirm-head">
        <svg className="chat-confirm-head-ico" aria-hidden>
          <use href="#i-swap" />
        </svg>
        <span>{headText}</span>
      </div>
      {preview && (
        <div className={`chat-confirm-preview${expanded ? ' expanded' : ''}`}>
          {preview}
        </div>
      )}
      {showToggle && (
        <div className="chat-confirm-toggle-wrap">
          <button
            type="button"
            className="chat-confirm-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <span className="caret" aria-hidden>▾</span>
            {expanded ? t('chat.showLess') : t('chat.showMore')}
          </button>
        </div>
      )}
      {cmd.status === 'error' && cmd.error && (
        <div className="chat-confirm-error">{cmd.error}</div>
      )}
    </div>
  );
}
