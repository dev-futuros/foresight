import { useEffect } from 'react';
import { useSetAssistantContext } from '../../chat/useAssistantContext';

/**
 * Publishes a wizard-state snapshot to the chat assistant on mount and
 * on every snapshot change, and clears it on unmount.
 *
 * <p>Why a dedicated hook (and not just two inline {@code useEffect}s):
 * the publish vs. unmount-clear split has a load-bearing subtlety that
 * was easy to lose in the page's main body. The publish effect
 * intentionally has NO cleanup function — adding one (the obvious
 * symmetric "clear on dep-change as well as unmount") makes the chat
 * panel briefly see {@code ctx: undefined} sandwiched between the old
 * and new publish, and in StrictMode could leave a stale
 * {@code undefined} dangling. Pulling the two effects into a hook
 * makes that split a single conceptual contract instead of two
 * effects-with-comments that future contributors might "tidy up".
 *
 * <p>Hands the caller's snapshot through verbatim — the chat panel
 * accepts {@code unknown}, and the wizard publishes extras
 * ({@code maxReached}, {@code isGenerating}) the chat's typed
 * {@link PublishedWizardContext} doesn't enumerate but downstream
 * snapshot builders read defensively.
 *
 * @param snapshot the wizard state to publish; pass {@code null} or
 *   {@code undefined} to publish nothing this render (rare — the
 *   typical pattern is to always pass a snapshot and let the hook's
 *   unmount handle the only clear).
 */
export function useAssistantPublishing(snapshot: unknown): void {
  const setAssistantContext = useSetAssistantContext();

  // Publish on mount + every snapshot change. NO cleanup here on
  // purpose — see the file-level doc comment for the StrictMode bug
  // that adding a symmetric clear introduces.
  useEffect(() => {
    setAssistantContext(snapshot);
  }, [setAssistantContext, snapshot]);

  // Dedicated unmount-only clear so route changes correctly hand the
  // assistant a blank slate. Empty dep array: this effect ONLY fires
  // its cleanup on unmount, never on snapshot change.
  useEffect(() => {
    return () => setAssistantContext(undefined);
  }, [setAssistantContext]);
}
