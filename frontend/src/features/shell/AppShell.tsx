import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import Stepper from './Stepper';
import AppFooter from './AppFooter';
import { StepperProvider } from './StepperContext';
import { useStepperSlot } from './useStepper';
import { AssistantContextProvider } from '../chat/AssistantContextProvider';
import AssistantCommands from '../chat/AssistantCommands';
import ChatAssistant from '../chat/ChatAssistant';
import { TranslationsProvider } from '../translations/TranslationsContext';
import AccountModal from '../account/AccountModal';
import { usePageViewTracking } from '../../lib/usePageViewTracking';
import './shell.css';

/**
 * Shared shell for protected routes: sticky top bar + (optional) sticky
 * stepper + page content + small footer + chat assistant + account modal.
 *
 * The chat assistant is mounted once at this level so it floats above any
 * route. {@link AssistantCommands} registers the always-available commands
 * (navigation, share/export, language); each route can register its own
 * page-scoped commands on mount.
 *
 * The account modal is opened from the topbar avatar button. Modal state is
 * local to this shell — the modal sits inside <ShellInner> so it inherits
 * the route's query client / providers and can call our hooks.
 */
function ShellInner() {
  const stepperState = useStepperSlot();
  const [accountOpen, setAccountOpen] = useState(false);
  // Fire a Mixpanel "Page Viewed" event on every route change.
  // No-op when Mixpanel isn't initialised / user hasn't consented,
  // so safe to mount unconditionally at the shell level.
  usePageViewTracking();
  return (
    <div className="app-shell">
      <TopBar onOpenAccount={() => setAccountOpen(true)} />
      {stepperState && <Stepper state={stepperState} />}
      {/* AssistantCommands MUST mount before <Outlet /> so its useEffect
          (which registers the navigation-only fallbacks) runs first. Pages
          that override commands like `goTo` (e.g. NewReportPage) register
          from inside the Outlet — they need to win, and useEffect order
          follows JSX order for sibling components. Mounting the shell
          commands first means page-scoped overrides land on top instead of
          getting overwritten by the shell's late registration. */}
      <AssistantCommands />
      <div className="app-main">
        <Outlet />
      </div>
      <AppFooter />
      <ChatAssistant />
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
}

export default function AppShell() {
  return (
    <StepperProvider>
      <AssistantContextProvider>
        <TranslationsProvider>
          <ShellInner />
        </TranslationsProvider>
      </AssistantContextProvider>
    </StepperProvider>
  );
}
