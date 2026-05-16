import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface SplitButtonOption {
  key: string;
  label: ReactNode;
  /**
   * HTML button type for the primary slot when this option is the
   * active one. Defaults to {@code 'button'}. Use {@code 'submit'}
   * only when the parent form's {@code onSubmit} handles validation
   * AND should run the same logic as this option's onClick — usually
   * cleaner to keep this {@code 'button'} and put the logic in
   * {@code onClick}.
   */
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
}

interface Props {
  /** Default action — initially what the primary button shows. */
  primary: SplitButtonOption;
  /**
   * Alternative actions. When empty (or omitted) no dropdown trigger
   * appears and the SplitButton renders as a plain primary button.
   * Picking an alternative from the menu does NOT run it — the
   * dropdown is a selector. The picked option swaps into the primary
   * slot and the user has to press the button to actually fire it.
   */
  options?: SplitButtonOption[];
  /** Class applied to the primary + toggle buttons. */
  primaryClassName?: string;
  /** Disables both the primary action and the dropdown toggle. */
  disabled?: boolean;
  /** Accessible label for the dropdown chevron. */
  menuAriaLabel?: string;
}

/**
 * Split-button primitive — a primary action plus an optional chevron
 * trigger that opens a menu of alternative actions.
 *
 * <p>The dropdown is a <strong>selector</strong>, not an action menu:
 * picking an item swaps it into the primary slot, and the user must
 * press the (now-relabelled) primary button to actually run it. This
 * mirrors the toolbar-button pattern in IDEs where the chevron picks
 * the mode and the button executes it. Keeps the "click to run" affordance
 * unambiguous and avoids accidentally firing the wrong action when the
 * user's mouse skids off the menu.
 *
 * <p>Selection state is local to this component instance — picking an
 * option lasts until the next render where {@link Props#primary}
 * changes (e.g. the parent toggled the default based on data state).
 */
export default function SplitButton({
  primary,
  options = [],
  primaryClassName = 'btn btn-primary',
  disabled,
  menuAriaLabel = 'More options',
}: Props) {
  const [open, setOpen] = useState(false);
  // Which option is currently in the primary slot. Defaults to the
  // declared primary; flips when the user picks an item from the menu.
  const [selectedKey, setSelectedKey] = useState<string>(primary.key);
  const rootRef = useRef<HTMLDivElement>(null);

  // When the parent re-selects the default (e.g. hasGlobalSteep flipped
  // and `primary` is now a different option object), realign the
  // internal selection so the button shows what the parent intends.
  // Otherwise a stale `selectedKey` would point at an option that no
  // longer exists in the list, and we'd silently fall back to primary.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- realign internal selection when the parent's primary option identity changes; pure-derivation isn't possible because the user can override selectedKey from the dropdown
    setSelectedKey(primary.key);
  }, [primary.key]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Resolve the active option — whatever the user last picked, falling
  // back to primary if selectedKey doesn't match anything (defensive).
  const all = [primary, ...options];
  const active = all.find((o) => o.key === selectedKey) ?? primary;
  // The menu shows every alternative — i.e. everything that isn't the
  // currently-active option.
  const menuItems = all.filter((o) => o.key !== active.key);
  const hasMenu = menuItems.length > 0;
  const groupClass = `split-btn${hasMenu ? ' split-btn--has-menu' : ''}`;

  return (
    <div className={groupClass} ref={rootRef}>
      <button
        type={active.type ?? 'button'}
        className={`${primaryClassName} split-btn-primary`}
        onClick={active.onClick}
        disabled={disabled || active.disabled}
      >
        {active.label}
      </button>
      {hasMenu && (
        <>
          <button
            type="button"
            className={`${primaryClassName} split-btn-toggle`}
            onClick={() => setOpen((p) => !p)}
            disabled={disabled}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={menuAriaLabel}
          >
            <svg
              className="split-btn-chevron"
              aria-hidden
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 4.5 L6 7.5 L9 4.5" />
            </svg>
          </button>
          {open && (
            <div className="split-btn-menu" role="menu">
              {menuItems.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className="split-btn-menu-item"
                  onClick={() => {
                    // Selector behaviour — just swap into the primary
                    // slot; do NOT run the action. The user clicks the
                    // primary button to fire it.
                    setSelectedKey(opt.key);
                    setOpen(false);
                  }}
                  disabled={opt.disabled}
                  role="menuitem"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
