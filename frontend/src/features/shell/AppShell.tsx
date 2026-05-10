import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import Stepper from './Stepper';
import AppFooter from './AppFooter';
import { StepperProvider, useStepperSlot } from './StepperContext';
import { AssistantContextProvider } from '../chat/AssistantContextProvider';
import AssistantCommands from '../chat/AssistantCommands';
import ChatAssistant from '../chat/ChatAssistant';
import './shell.css';

/**
 * Shared shell for protected routes: sticky top bar + (optional) sticky
 * stepper + page content + small footer + chat assistant. Wizard pages opt
 * in to the stepper via useSetStepper(...); other pages get just topbar +
 * content + footer.
 *
 * The chat assistant is mounted once at this level so it floats above any
 * route. {@link AssistantCommands} registers the always-available commands
 * (navigation, share/export, language); each route can register its own
 * page-scoped commands on mount.
 */
function ShellInner() {
  const stepperState = useStepperSlot();
  return (
    <div className="app-shell">
      <TopBar />
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
    </div>
  );
}

export default function AppShell() {
  return (
    <StepperProvider>
      <AssistantContextProvider>
        <ShellInner />
      </AssistantContextProvider>
    </StepperProvider>
  );
}
