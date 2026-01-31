import { useState } from "react";
import { useNavigate } from "react-router-dom";
import GrandPlanPage from "../pages/GrandPlanPage";
import EnzoOverlay from "./EnzoOverlay";
import { loadOnboarding, saveOnboarding } from "../app/onboarding";
import { APP_MAIN_COLOR } from "../app/theme";

export default function GrandPlanTutorialWrapper() {
  const [tick, setTick] = useState(0);
  const [dismissed, setDismissed] = useState(() => loadOnboarding().grandPlanTutorialComplete);
  const navigate = useNavigate();

  const handleComplete = () => {
    const progress = loadOnboarding();
    progress.grandPlanTutorialComplete = true;
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
        padding: "16px 32px",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* Spacer for macOS window controls */}
      <div style={{ height: 36 }} />

      {/* Tutorial header — Back button occupies the Calendar's DOM slot */}
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

      <GrandPlanPage tutorialMode onTutorialTick={() => setTick((t) => t + 1)} />
      <EnzoOverlay
        tick={tick}
        dismissed={dismissed}
        onDismiss={() => setDismissed(true)}
        onComplete={handleComplete}
      />
    </div>
  );
}
