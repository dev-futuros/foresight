import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useChat, type PendingCommand } from './hooks/useChat';
import { useAssistantContext } from './useAssistantContext';
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
import MessageView from './components/MessageView';
import {
  PRE_NAV_DELAY_MS,
  STEP_FOR_FIELD_ID,
  type PublishedWizardContext,
} from './constants';
import './chat.css';

// Constants (STEP_FOR_FIELD_ID, FIELD_NAME_KEY, PREVIEW_TOGGLE_THRESHOLD,
// PRE_NAV_DELAY_MS) and the PublishedWizardContext interface moved to
// ./constants in Phase 3. Text-render helpers (escapeHtml, renderInlineMd)
// moved to ./utils/textRender — they're now used by ./components/*.

const EMPTY_EMPRESA: EmpresaData = {
  name: '',
  sector: '',
  size: '',
  horizon: '',
  market: '',
  challenge: '',
  strengths: '',
  consultantName: '',
  consultantCompany: '',
  title: '',
};
const EMPTY_GLOBAL_STEEP: GlobalSteepData = { S: '', T: '', E: '', ENV: '', P: '' };
const EMPTY_STEEP: SteepData = {
  social: '',
  technological: '',
  economic: '',
  environmental: '',
  political: '',
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
  const language: 'es' | 'en' | 'ca' = i18n.language?.startsWith('en')
    ? 'en'
    : i18n.language?.startsWith('ca')
      ? 'ca'
      : 'es';
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
    const wanted = Number.isFinite(n) ? n : 380;
    // Clamp at construction so the very first paint can't spill off-screen
    // on a viewport narrower than the persisted width.
    const min = 320;
    const max = Math.min(760, Math.max(min, window.innerWidth - 320));
    return Math.min(Math.max(wanted, min), max);
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
  useEffect(() => {
    snapshotRef.current = { context: snapshot, language };
  });

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
  // Clamping happens at every call site (setChatWidth(clampWidth(...)));
  // the effect is purely the side-effect mirror: CSS var + persistence.
  useEffect(() => {
    document.documentElement.style.setProperty('--chat-w', `${chatWidth}px`);
    try {
      window.localStorage?.setItem('fs_chat_width', String(chatWidth));
    } catch {
      /* private-browsing / storage-disabled — no-op. */
    }
  }, [chatWidth]);
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
    () => messages.filter((m) => !m.hidden && m.message.role === 'assistant').length,
    [messages],
  );
  const lastSeenAssistantCountRef = useRef(visibleAssistantCount);
  // While the panel is OPEN, keep the high-water mark synced so a later
  // close+message doesn't replay all the messages the user already saw.
  useEffect(() => {
    if (open) lastSeenAssistantCountRef.current = visibleAssistantCount;
  }, [open, visibleAssistantCount]);
  // While the panel is CLOSED, count new assistant messages so we can pulse
  // the badge. The reset happens in the open-button handler.
  useEffect(() => {
    if (open) return;
    const prev = lastSeenAssistantCountRef.current;
    if (visibleAssistantCount > prev) {
      const delta = visibleAssistantCount - prev;
      lastSeenAssistantCountRef.current = visibleAssistantCount;
      setUnread((u) => u + delta);
    }
  }, [visibleAssistantCount, open]);

  const openChat = useCallback(() => {
    setOpen(true);
    setUnread(0);
    lastSeenAssistantCountRef.current = visibleAssistantCount;
  }, [visibleAssistantCount]);

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
          onClick={openChat}
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
                <span />
                <span />
                <span />
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

