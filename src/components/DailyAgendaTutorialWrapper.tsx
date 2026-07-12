import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import DailyAgendaPage from "../pages/DailyAgendaPage";
import DailyAgendaEnzoOverlay from "./DailyAgendaEnzoOverlay";
import { loadOnboarding, saveOnboarding } from "../app/onboarding";
import { loadState, STATE_KEY } from "../app/storage";
import { flushStorageKey } from "../app/storageBackend";
import { useDateNavigation } from "../contexts/DateNavigationContext";
import { APP_MAIN_COLOR } from "../app/theme";

export default function DailyAgendaTutorialWrapper() {
  const [tick, setTick] = useState(0);
  const [dismissed, setDismissed] = useState(() => loadOnboarding().dailyAgendaTutorialComplete);
  const [wizardState, setWizardState] = useState({
    open: false,
    wizardStep: 0,
    primarySelected: false,
    meetingCount: 0,
    focusSessionCount: 0,
  });
  const navigate = useNavigate();
  const { selectedDate } = useDateNavigation();

  const state = loadState();
  const day = state.days[selectedDate];
  const isWorkingDay = !!day?.isWorkingDay;

  const handleTutorialTick = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  const handleWizardStateChange = useCallback((info: {
    open: boolean;
    wizardStep: number;
    primarySelected: boolean;
    meetingCount: number;
    focusSessionCount: number;
  }) => {
    setWizardState(info);
  }, []);

  const handleComplete = useCallback(async () => {
    await flushStorageKey(STATE_KEY);
    const progress = loadOnboarding();
    progress.dailyAgendaTutorialComplete = true;
    saveOnboarding(progress);
    navigate("/get-started", { state: { step: 3 } });
  }, [navigate]);

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

      <DailyAgendaPage
        tutorialMode
        onTutorialTick={handleTutorialTick}
        onWizardStateChange={handleWizardStateChange}
      />
      <DailyAgendaEnzoOverlay
        tick={tick}
        dismissed={dismissed}
        onDismiss={() => setDismissed(true)}
        onComplete={handleComplete}
        isWorkingDay={isWorkingDay}
        wizardOpen={wizardState.open}
        wizardStep={wizardState.wizardStep}
        primarySelected={wizardState.primarySelected}
        meetingCount={wizardState.meetingCount}
        focusSessionCount={wizardState.focusSessionCount}
      />
    </div>
  );
}
