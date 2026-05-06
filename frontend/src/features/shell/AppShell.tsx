import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import Stepper from './Stepper';
import AppFooter from './AppFooter';
import { StepperProvider, useStepperSlot } from './StepperContext';
import './shell.css';

/**
 * Shared shell for protected routes: sticky top bar + (optional) sticky
 * stepper + page content + small footer. Wizard pages opt in to the stepper
 * via useSetStepper(...); other pages get just topbar + content + footer.
 */
function ShellInner() {
  const stepperState = useStepperSlot();
  return (
    <div className="app-shell">
      <TopBar />
      {stepperState && <Stepper state={stepperState} />}
      <div className="app-main">
        <Outlet />
      </div>
      <AppFooter />
    </div>
  );
}

export default function AppShell() {
  return (
    <StepperProvider>
      <ShellInner />
    </StepperProvider>
  );
}
