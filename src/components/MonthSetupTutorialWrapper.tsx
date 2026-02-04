import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import MonthSetupPage from "../pages/MonthSetupPage";
import MonthSetupEnzoOverlay from "./MonthSetupEnzoOverlay";
import { loadOnboarding, saveOnboarding } from "../app/onboarding";
import { loadState, getMonth } from "../app/storage";
import { useDateNavigation } from "../contexts/DateNavigationContext";
import { APP_MAIN_COLOR } from "../app/theme";

export default function MonthSetupTutorialWrapper() {
  const [tick, setTick] = useState(0);
  const [dismissed, setDismissed] = useState(() => loadOnboarding().monthSetupTutorialComplete);
  const [wizardState, setWizardState] = useState({ open: false, primarySelected: false, wizardStep: 0 });
  const navigate = useNavigate();
  const { selectedMonth } = useDateNavigation();

  // Derive persisted state from storage on each tick
  const state = loadState();
  const plan = getMonth(state, selectedMonth);
  const hasPlan = !!plan;
  const templateCount = plan?.templates?.length ?? 0;
  const hasPinnedMilestones = (plan?.pinnedMilestoneIds?.length ?? 0) > 0;
  const taskCount = plan?.tasks?.length ?? 0;

  const handleTutorialTick = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  const handleWizardStateChange = useCallback((info: { open: boolean; primarySelected: boolean; wizardStep: number }) => {
    setWizardState(info);
  }, []);

  const handleComplete = () => {
    const progress = loadOnboarding();
    progress.monthSetupTutorialComplete = true;
    saveOnboarding(progress);
    navigate("/get-started", { state: { step: 3 } });
  };

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        width: "100%",
        maxWidth: 1280,
        margin: "0 auto",
        padding: "52px 32px 16px 32px",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* Tutorial header — Back button in Calendar's DOM slot */}
      {dismissed && (
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            paddingBottom: 12,
            marginBottom: 12,
            borderBottom: "1px solid #eee",
          }}
        >
          <button
            onClick={handleComplete}
            style={{
              padding: "10px 14px",
              borderRadius: 14,
              border: `2px solid ${APP_MAIN_COLOR}`,
              backgroundColor: "white",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: APP_MAIN_COLOR,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            ← Back to Get Started
          </button>
          <div />
        </header>
      )}

      <MonthSetupPage
        tutorialMode
        onTutorialTick={handleTutorialTick}
        onWizardStateChange={handleWizardStateChange}
      />
      <MonthSetupEnzoOverlay
        tick={tick}
        dismissed={dismissed}
        onDismiss={() => setDismissed(true)}
        onComplete={handleComplete}
        hasPlan={hasPlan}
        wizardOpen={wizardState.open}
        wizardPrimarySelected={wizardState.primarySelected}
        wizardStep={wizardState.wizardStep}
        templateCount={templateCount}
        hasPinnedMilestones={hasPinnedMilestones}
        taskCount={taskCount}
      />
    </div>
  );
}
