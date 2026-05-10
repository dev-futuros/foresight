import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useChat, type PendingConfirm } from '../../hooks/useChat';
import { useAssistantContext } from './AssistantContextProvider';
import type { ChatContentBlock, ChatMessage } from '../../lib/aiClient';
import {
  buildAssistantSnapshot,
  type AssistantSnapshotInput,
} from '../../lib/buildAssistantSnapshot';
import api from '../../lib/api';
import type { EmpresaData } from '../report/steps/StepEmpresa';
import type { GlobalSteepData } from '../report/steps/StepGlobal';
import type { SteepData } from '../report/steps/StepSteep';
import type { HorizonData } from '../report/steps/StepHorizon';
import type { Page, ReportSummary } from '../../types/api';
import './chat.css';

/** Same shape NewReportPage publishes via setAssistantContext. Other pages
 *  (dashboard, account, report viewer) don't publish today; their fields
 *  default to empty so the snapshot still emits the full field listing
 *  with {@code (empty)} markers. */
interface PublishedWizardContext {
  currentStep?: number;
  empresa?: EmpresaData;
  globalSteep?: GlobalSteepData;
  steep?: SteepData;
  horizon?: HorizonData;
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
 * Floating chat assistant. Renders an edge button on the right side of the
 * viewport; clicking opens a side panel with the conversation, an input and
 * any pending confirmation chips waiting on user approval.
 *
 * Available throughout the authenticated app — the parent ({@link AppShell})
 * mounts it once. The conversation state is owned by {@link useChat} and
 * reset only on explicit user action (the reset button in the header) or
 * when the assistant context changes hard (handled inside the hook by the
 * consumer; see {@link AssistantContextProvider}).
 */
export default function ChatAssistant() {
  const { t, i18n } = useTranslation();
  const ctx = useAssistantContext() as PublishedWizardContext | undefined;
  const language: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const location = useLocation();

  const {
    messages,
    pending,
    error,
    pendingConfirms,
    send,
    resolveConfirm,
    reset,
  } = useChat();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);

  // Saved-reports list — surfaced in the snapshot so the assistant can call
  // loadReport / editReport / shareReport / exportPDF / exportPPT with an
  // explicit id without making the user load the report first. Gated on
  // `open` because the snapshot is only consumed when the user actually
  // sends a message; firing the request on every shell mount would be
  // wasteful for users who never open the chat. Shares the same query key
  // as useReports(0, 20) so the dashboard's existing fetch dedupes for free.
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

  // Build the formatted USER STATE block. This is the string the backend
  // stitches into the system prompt verbatim. Recompute on every render —
  // it's pure string work over already-derived state, cheap enough that
  // memoization noise (unstable nested-object deps) isn't worth the win.
  const snapshotInput: AssistantSnapshotInput = {
    language,
    currentStep: ctx?.currentStep ?? 1,
    dashboardOpen: location.pathname === '/dashboard',
    empresa: ctx?.empresa ?? EMPTY_EMPRESA,
    globalSteep: ctx?.globalSteep ?? EMPTY_GLOBAL_STEEP,
    steep: ctx?.steep ?? EMPTY_STEEP,
    horizon: ctx?.horizon ?? EMPTY_HORIZON,
    reports: reportsPage?.content,
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
      reportsPage,
    ],
  );

  // Auto-scroll to the latest message every time the conversation grows or
  // the assistant finishes thinking. Using `scrollHeight` directly (vs
  // scrollIntoView) avoids the page jumping when the panel is offscreen on
  // mobile.
  useEffect(() => {
    if (!open) return;
    const node = msgsRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, pending, pendingConfirms.length, open]);

  // Refocus the input each time the panel opens or the assistant turn ends —
  // saves the user a click when typing follow-up questions.
  useEffect(() => {
    if (open && !pending) {
      inputRef.current?.focus();
    }
  }, [open, pending]);

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  function onSubmit() {
    if (!draft.trim() || pending) return;
    send(draft, { context: snapshot, language });
    setDraft('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          className="chat-edge"
          aria-label={t('chat.openAria')}
          title={t('chat.openTitle')}
          onClick={() => setOpen(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12z" />
          </svg>
        </button>
      )}

      <aside
        className={`chat-panel${open ? ' open' : ''}`}
        role="dialog"
        aria-label={t('chat.title')}
        aria-hidden={!open}
      >
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
            className="chat-head-btn"
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
          {messages.length === 0 && (
            <div className="chat-empty">
              <p>{t('chat.intro')}</p>
            </div>
          )}
          {messages.map((m, i) => (
            <MessageView
              key={i}
              message={m}
              pendingConfirms={pendingConfirms}
              onApprove={(id) => resolveConfirm(id, true)}
              onDecline={(id) => resolveConfirm(id, false)}
            />
          ))}
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
  message: ChatMessage;
  pendingConfirms: PendingConfirm[];
  onApprove: (toolUseId: string) => void;
  onDecline: (toolUseId: string) => void;
}

/**
 * Renders one assistant or user turn. Plain string content is shown as a
 * speech bubble. Block arrays are walked: text → bubble, tool_use →
 * confirmation chip (when pending) or activity entry (when already resolved),
 * tool_result → suppressed (the next assistant turn already spoke about it).
 */
function MessageView({ message, pendingConfirms, onApprove, onDecline }: MessageViewProps) {
  if (typeof message.content === 'string') {
    return (
      <div className={`chat-msg ${message.role === 'user' ? 'user' : 'bot'}`}>
        <div className="chat-bubble-text">{message.content}</div>
      </div>
    );
  }

  return (
    <div className={`chat-msg ${message.role === 'user' ? 'user' : 'bot'}`}>
      {message.content.map((block, i) => (
        <BlockView
          key={i}
          block={block}
          pendingConfirms={pendingConfirms}
          onApprove={onApprove}
          onDecline={onDecline}
        />
      ))}
    </div>
  );
}

function BlockView({
  block,
  pendingConfirms,
  onApprove,
  onDecline,
}: {
  block: ChatContentBlock;
  pendingConfirms: PendingConfirm[];
  onApprove: (toolUseId: string) => void;
  onDecline: (toolUseId: string) => void;
}) {
  if (block.type === 'text' && block.text) {
    return <div className="chat-bubble-text">{block.text}</div>;
  }
  if (block.type === 'tool_use' && block.id && block.name) {
    const pending = pendingConfirms.find((c) => c.toolUseId === block.id);
    if (pending) {
      return (
        <div className="chat-confirm">
          <div className="chat-confirm-head">{pending.label}</div>
          {pending.preview && <div className="chat-confirm-preview">{pending.preview}</div>}
          <div className="chat-confirm-actions">
            <button
              type="button"
              className="chat-confirm-btn chat-confirm-btn--accept"
              onClick={() => onApprove(block.id!)}
            >
              ✓
            </button>
            <button
              type="button"
              className="chat-confirm-btn"
              onClick={() => onDecline(block.id!)}
            >
              ✕
            </button>
          </div>
        </div>
      );
    }
    // Already resolved — render as a quiet activity line so the user can
    // still see what the assistant did.
    return <div className="chat-activity">⟶ {block.name}</div>;
  }
  // tool_result and unknown types are silent — the next assistant text
  // turn already speaks to them, and rendering raw JSON adds noise.
  return null;
}
