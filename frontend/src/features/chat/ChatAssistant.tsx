import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { dispatch as dispatchCommand } from '../../lib/commandBus';
import api from '../../lib/api';
import type { EmpresaData } from '../report/steps/StepEmpresa';
import type { GlobalSteepData } from '../report/steps/StepGlobal';
import type { SteepData } from '../report/steps/StepSteep';
import type { HorizonData } from '../report/steps/StepHorizon';
import type { Page, ReportSummary } from '../../types/api';
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

/** Lookup table mapping setField field ids to a concise human-readable
 *  label suitable for the chip head. Localised values live in
 *  i18n.chat.fields; this map just bridges the raw ids the model sends
 *  to those translation keys. */
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
 *  toggle. Below this the preview fits within the 4-line clamp anyway, so
 *  a toggle is meaningless visual noise. Matches the staging demo's
 *  heuristic. */
const PREVIEW_TOGGLE_THRESHOLD = 120;

/** Delay between firing the pre-navigation goTo and resolving the chip.
 *  Long enough for the user to see the destination step flash, short enough
 *  that the apply doesn't feel laggy. Matches the staging demo. */
const PRE_NAV_DELAY_MS = 280;

/**
 * Tiny inline-markdown pass ported from the staging demo's
 * {@code renderChatMarkdown}. Supports {@code **bold**}, {@code *italic*}
 * and {@code `code`} — the three markers the assistant's system prompt
 * actually emits. Anything else passes through as escaped plain text.
 *
 * <p>Security: the input is HTML-escaped FIRST, then only the specific
 * markdown patterns are replaced with the corresponding tags. Nothing the
 * LLM (or user) can write reaches the DOM unescaped except for the
 * literal {@code <strong>}, {@code <em>}, {@code <code>} we inject.
 *
 * <p>Line breaks are intentionally not transformed: {@code white-space:
 * pre-wrap} on {@code .chat-bubble-text} already preserves newlines in
 * the source text, so doubling them as {@code <br>} would over-space.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function renderInlineMd(text: string): string {
  let h = escapeHtml(text);
  // Order matters: code first so backticks aren't confused with stars
  // inside code spans. Bold before italic so `**foo**` doesn't get
  // partially eaten by the italic rule. The italic lookarounds prevent
  // a stray `*` from neighbouring bold markup being re-matched.
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  return h;
}

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

  // Toggle a body-level class while the chat panel is open. shell.css uses
  // it to push the .app-shell content left by the panel width so the chat
  // doesn't overlap any of the page underneath — matches the demo's
  // "push content aside" behaviour rather than the older overlay style.
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

  function onSubmit() {
    if (!draft.trim() || pending) return;
    send(draft, { context: snapshot, language });
    setDraft('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }

  /**
   * Single-chip approve. When the chip is a setField targeting a field that
   * lives on a different step than the user is currently on, dispatch goTo
   * first and pause briefly so the user actually sees the destination
   * before its value is written. For every other chip (and for setField
   * targeting the current step), this is just a thin wrapper around
   * resolveConfirm.
   *
   * <p>Note the explicit currentStep readback from ctx — we deliberately
   * don't capture it in a closure because the user may have navigated
   * between when the chip was queued and when they clicked it. The
   * snapshot also has it but ctx is the authoritative live value.
   */
  const handleApproveChip = useCallback(
    async (toolUseId: string) => {
      const target = pendingConfirms.find((c) => c.toolUseId === toolUseId);
      if (target && target.name === 'setField') {
        const fieldId = (target.input as { id?: unknown }).id;
        if (typeof fieldId === 'string') {
          const targetStep = STEP_FOR_FIELD_ID[fieldId];
          const currentStep = ctx?.currentStep ?? 0;
          if (targetStep && targetStep !== currentStep) {
            try {
              await dispatchCommand('goTo', { step: targetStep });
              await new Promise((r) => setTimeout(r, PRE_NAV_DELAY_MS));
            } catch {
              // goTo can throw on edge cases (e.g. step 5 reached the
              // wizard's guard). Swallow and proceed — the chip still
              // applies; worst case the user just doesn't see the
              // destination flash. Better than blocking the apply.
            }
          }
        }
      }
      await resolveConfirm(toolUseId, true);
    },
    [pendingConfirms, ctx?.currentStep, resolveConfirm],
  );

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
          {/* Close X is hidden on desktop — dismissal goes through the
              .chat-collapse handle on the panel's left edge. On mobile
              the panel is full-width and the collapse handle is hidden,
              so this X becomes the primary close affordance. */}
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
              onApprove={handleApproveChip}
              onApproveDirect={(id) => resolveConfirm(id, true)}
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

      {/* Mini collapse handle — sits on the panel's left edge while the chat
          is open. At rest, a small clickable nub; on hover, expands to show
          the chevron icon. CSS handles the slide-in animation in lockstep
          with the panel's width transition. Always rendered (visibility
          toggles) so the right-position transition can fire. */}
      <button
        type="button"
        className="chat-collapse"
        onClick={() => setOpen(false)}
        title={t('chat.close')}
        aria-label={t('chat.close')}
        tabIndex={open ? 0 : -1}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </>
  );
}

interface MessageViewProps {
  message: ChatMessage;
  pendingConfirms: PendingConfirm[];
  /** Single-chip approve. Wraps resolveConfirm with the pre-navigation
   *  step jump for setField on other steps. */
  onApprove: (toolUseId: string) => void | Promise<void>;
  /** Bypasses pre-navigation. Used by the Apply-all button — firing chips
   *  in DOM order while ping-ponging across steps would be jarring. The
   *  Promise-returning shape lets the apply-all loop {@code await} each
   *  resolution sequentially. */
  onApproveDirect: (toolUseId: string) => Promise<void>;
}

type ApplyAllState = 'idle' | 'running' | 'done';

/**
 * Renders one assistant or user turn. Plain string content is shown as a
 * speech bubble. Block arrays are walked: text → bubble, tool_use →
 * confirmation chip (when pending) or activity entry (when already resolved),
 * tool_result → suppressed (the next assistant turn already spoke about it).
 *
 * <p>When this message's assistant turn produced 2+ confirm chips that are
 * still pending, an "Apply all" button is rendered after the last block.
 * It fires every pending chip in DOM order, sequentially. The button is
 * locked to a "done" state once clicked so the bubble doesn't lose the
 * affordance the moment chips start resolving.
 */
function MessageView({
  message,
  pendingConfirms,
  onApprove,
  onApproveDirect,
}: MessageViewProps) {
  const { t } = useTranslation();
  const [applyAllState, setApplyAllState] = useState<ApplyAllState>('idle');

  if (typeof message.content === 'string') {
    const isBot = message.role !== 'user';
    return (
      <div className={`chat-msg ${isBot ? 'bot' : 'user'}`}>
        {isBot ? (
          // Assistant string content (rare path — most assistant turns
          // come as block arrays). Render through the tiny markdown pass
          // so any **bold**/`code`/*italic* still works.
          <div
            className="chat-bubble-text"
            dangerouslySetInnerHTML={{ __html: renderInlineMd(message.content) }}
          />
        ) : (
          // User content — auto-escaped by React, no markdown.
          <div className="chat-bubble-text">{message.content}</div>
        )}
      </div>
    );
  }

  // Walk this message's blocks once to find the tool_use ids that are
  // still awaiting user approval (excluding chips already in the
  // applied=true state). Used both for the apply-all visibility check
  // and as the click-time iteration order (DOM order).
  const blocks = message.content;
  const pendingIdsInBubble: string[] = [];
  for (const b of blocks) {
    if (
      b.type === 'tool_use' &&
      b.id &&
      pendingConfirms.some((c) => c.toolUseId === b.id && !c.applied)
    ) {
      pendingIdsInBubble.push(b.id);
    }
  }
  const showApplyAll = applyAllState !== 'idle' || pendingIdsInBubble.length >= 2;

  async function handleApplyAll() {
    if (applyAllState !== 'idle') return;
    // Snapshot the id list NOW — pendingConfirms shrinks as each one
    // resolves, so re-deriving it per iteration would skip everything
    // after the first.
    const ids = pendingIdsInBubble.slice();
    setApplyAllState('running');
    for (const id of ids) {
      // Apply-all uses the direct path (no pre-navigation). Sequential
      // because the chips are intentionally being applied as a batch
      // and parallel firing would let later ones race ahead of earlier
      // ones in the conversation history.
      await onApproveDirect(id);
    }
    setApplyAllState('done');
  }

  return (
    <div className={`chat-msg ${message.role === 'user' ? 'user' : 'bot'}`}>
      {blocks.map((block, i) => (
        <BlockView
          key={i}
          block={block}
          pendingConfirms={pendingConfirms}
          onApprove={onApprove}
        />
      ))}
      {showApplyAll && (
        <button
          type="button"
          className={`chat-apply-all${applyAllState === 'done' ? ' done' : ''}`}
          onClick={handleApplyAll}
          disabled={applyAllState !== 'idle'}
        >
          {applyAllState === 'done' ? t('chat.applyAllDone') : t('chat.applyAll')}
        </button>
      )}
    </div>
  );
}

function BlockView({
  block,
  pendingConfirms,
  onApprove,
}: {
  block: ChatContentBlock;
  pendingConfirms: PendingConfirm[];
  onApprove: (toolUseId: string) => void;
}) {
  if (block.type === 'text' && block.text) {
    // Assistant prose — render the demo's tiny markdown subset. Safe:
    // renderInlineMd escapes first, then only injects <strong>, <em>,
    // <code> from matching markdown patterns.
    return (
      <div
        className="chat-bubble-text"
        dangerouslySetInnerHTML={{ __html: renderInlineMd(block.text) }}
      />
    );
  }
  if (block.type === 'tool_use' && block.id && block.name) {
    const pending = pendingConfirms.find((c) => c.toolUseId === block.id);
    if (pending) {
      return (
        <ConfirmChip
          toolUseId={block.id}
          pending={pending}
          onApprove={onApprove}
        />
      );
    }
    // No matching pending → the chip was either declined (silently
    // dropped on next message) or this is from before the applied-flag
    // refactor. Render nothing rather than a stale tag.
    return null;
  }
  // tool_result and unknown types are silent — the next assistant text
  // turn already speaks to them, and rendering raw JSON adds noise.
  return null;
}

/**
 * Single confirm chip with collapsible preview. Preview is clamped to 4
 * lines via CSS by default; if the proposed value is long enough to plausibly
 * overflow the clamp, a Show more / Show less toggle is rendered.
 *
 * <p>The char-length threshold ({@link PREVIEW_TOGGLE_THRESHOLD}) is a
 * heuristic — short single-line text fits inside the clamp regardless, and
 * very long text always exceeds it. Borderline cases (e.g. 110 chars with
 * many newlines) miss the toggle, which is acceptable because the user can
 * still read the visible portion and the chip's approve action doesn't
 * depend on having seen every character.
 */
function ConfirmChip({
  toolUseId,
  pending,
  onApprove,
}: {
  toolUseId: string;
  pending: PendingConfirm;
  onApprove: (toolUseId: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const showToggle = !!pending.preview && pending.preview.length >= PREVIEW_TOGGLE_THRESHOLD;
  const applied = !!pending.applied;

  /** Head text — for setField chips, render "REPLACE IN: <field>" /
   *  "ADD TO: <field>" / "APPLIED TO: <field>" using human-readable
   *  field names from {@link FIELD_NAME_KEY}. For other commands, fall
   *  back to the spec-provided label (covers runAnalysis, delete, etc.).
   *  The pending state's verb depends on the setField mode arg so the
   *  chip shows what's actually about to happen. */
  const headText = (() => {
    if (pending.name === 'setField') {
      const input = pending.input as { id?: string; mode?: string } | undefined;
      const fieldId = input?.id ?? '';
      const fieldKey = FIELD_NAME_KEY[fieldId];
      const fieldName = fieldKey ? t(fieldKey) : fieldId;
      const verb = applied
        ? t('chat.appliedTo')
        : input?.mode === 'add'
          ? t('chat.addTo')
          : t('chat.replaceIn');
      return `${verb}: ${fieldName}`;
    }
    return pending.label;
  })();

  /** The chip body itself is the click target — clicking ANYWHERE on
   *  the chip (head, preview area, even whitespace) approves the
   *  action. Once applied, the chip is "spent" — further clicks are
   *  no-ops (the chip stays visible in green-applied state). */
  function handleChipClick() {
    if (applied) return;
    onApprove(toolUseId);
  }
  function handleChipKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (applied) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onApprove(toolUseId);
    }
  }

  return (
    // Plain div + role=button (not <button>) so the nested "Show more"
    // <button> doesn't produce invalid button-in-button HTML. Keyboard
    // accessibility is restored via tabIndex + Enter/Space handlers.
    <div
      className={`chat-confirm${expanded ? ' expanded' : ''}${applied ? ' applied' : ''}`}
      role={applied ? undefined : 'button'}
      tabIndex={applied ? -1 : 0}
      onClick={handleChipClick}
      onKeyDown={handleChipKeyDown}
      aria-label={headText}
      aria-disabled={applied || undefined}
    >
      <div className="chat-confirm-head">
        <svg className="chat-confirm-head-ico" aria-hidden>
          <use href="#i-swap" />
        </svg>
        <span>{headText}</span>
      </div>
      {pending.preview && (
        <div className={`chat-confirm-preview${expanded ? ' expanded' : ''}`}>
          {pending.preview}
        </div>
      )}
      {showToggle && (
        <div className="chat-confirm-toggle-wrap">
          <button
            type="button"
            className="chat-confirm-toggle"
            onClick={(e) => {
              // Don't bubble — toggling the preview shouldn't fire the
              // outer chip's apply handler.
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            // Match Enter/Space to its own toggle action so keyboard
            // users don't accidentally apply the chip.
            onKeyDown={(e) => e.stopPropagation()}
          >
            <span className="caret" aria-hidden>▾</span>
            {expanded ? t('chat.showLess') : t('chat.showMore')}
          </button>
        </div>
      )}
    </div>
  );
}
