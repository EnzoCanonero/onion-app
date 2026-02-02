import { useEffect, useMemo, useRef, useState } from "react";
import { loadState } from "../app/storage";
import { APP_MAIN_COLOR } from "../app/theme";

type TutorialStep = 0 | 1 | 2 | 3 | 4;

const STEP_CONFIG: Record<number, { title: string; message: string; target: string }> = {
  0: {
    title: "Create Your Plan",
    message: "Every great journey starts with a plan. Click the button below to create your Grand Plan!",
    target: "create-plan",
  },
  1: {
    title: "Add a Category",
    message: "Categories are the pillars of your plan. Add your first one — think Work, Health, or Learning.",
    target: "add-category",
  },
  2: {
    title: "Add a Goal",
    message: "Goals are the big things you want to achieve. Add one inside your new category.",
    target: "add-goal",
  },
  3: {
    title: "Add a Milestone",
    message: "Milestones are concrete steps toward your goal. Keep them high level, not overly detailed tasks. You will be able to add detailed tasks later in the monthly setup. Click \"+ Add Milestone\" on the goal you just created.",
    target: "add-milestone",
  },
};

const COMPLETION_MESSAGE = "You did it! Your Grand Plan is taking shape. Feel free to keep editing, or head back to continue your setup.";

function deriveTutorialStep(state: ReturnType<typeof loadState>): TutorialStep {
  if (!state.grandPlan) return 0;
  if (state.grandPlan.categories.length === 0) return 1;
  const hasGoal = state.grandPlan.milestones.some((m) => m.parentId === null);
  if (!hasGoal) return 2;
  const hasSubMilestone = state.grandPlan.milestones.some((m) => m.parentId !== null);
  if (!hasSubMilestone) return 3;
  return 4;
}

type EnzoOverlayProps = {
  tick: number;
  dismissed: boolean;
  onDismiss: () => void;
  onComplete: () => void;
};

export default function EnzoOverlay({ tick, dismissed, onDismiss, onComplete }: EnzoOverlayProps) {
  const state = useMemo(() => loadState(), [tick]);
  const step = deriveTutorialStep(state);
  const [typedCount, setTypedCount] = useState(0);
  const [prevStep, setPrevStep] = useState<TutorialStep>(step);
  const highlightRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset typewriter when step changes
  useEffect(() => {
    if (step !== prevStep) {
      setTypedCount(0);
      setPrevStep(step);
    }
  }, [step, prevStep]);

  // Typewriter effect
  const currentMessage = step < 4 ? STEP_CONFIG[step].message : COMPLETION_MESSAGE;
  useEffect(() => {
    if (dismissed) return;
    if (typedCount >= currentMessage.length) return;
    timerRef.current = setInterval(() => {
      setTypedCount((c) => {
        if (c >= currentMessage.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          return c;
        }
        return c + 1;
      });
    }, 25);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentMessage, dismissed, typedCount]);

  // Highlight target button
  useEffect(() => {
    if (dismissed || step >= 4) {
      if (highlightRef.current) {
        highlightRef.current.style.removeProperty("box-shadow");
        highlightRef.current.style.removeProperty("animation");
        highlightRef.current = null;
      }
      return;
    }
    const target = STEP_CONFIG[step].target;
    const tryHighlight = () => {
      const el = document.querySelector(`[data-tutorial-target="${target}"]`) as HTMLElement | null;
      if (highlightRef.current && highlightRef.current !== el) {
        highlightRef.current.style.removeProperty("box-shadow");
        highlightRef.current.style.removeProperty("animation");
      }
      if (el) {
        el.style.boxShadow = `0 0 0 3px ${APP_MAIN_COLOR}, 0 0 16px ${APP_MAIN_COLOR}66`;
        el.style.animation = "enzo-pulse 1.5s ease-in-out infinite";
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        highlightRef.current = el;
      }
    };
    // Small delay to allow DOM to settle after state changes
    const timeout = setTimeout(tryHighlight, 300);
    return () => {
      clearTimeout(timeout);
      if (highlightRef.current) {
        highlightRef.current.style.removeProperty("box-shadow");
        highlightRef.current.style.removeProperty("animation");
        highlightRef.current = null;
      }
    };
  }, [step, dismissed, tick]);

  if (dismissed) return null;

  const displayedText = currentMessage.slice(0, typedCount);
  const isComplete = step === 4;

  return (
    <>
      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes enzo-pulse {
          0%, 100% { box-shadow: 0 0 0 3px ${APP_MAIN_COLOR}, 0 0 16px ${APP_MAIN_COLOR}66; }
          50% { box-shadow: 0 0 0 6px ${APP_MAIN_COLOR}, 0 0 24px ${APP_MAIN_COLOR}99; }
        }
        @keyframes enzo-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 340,
          backgroundColor: "white",
          borderRadius: 16,
          border: `2px solid ${APP_MAIN_COLOR}`,
          boxShadow: `0 8px 32px rgba(0,0,0,0.15), 0 0 0 1px ${APP_MAIN_COLOR}22`,
          zIndex: 900,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: `linear-gradient(135deg, ${APP_MAIN_COLOR}, ${APP_MAIN_COLOR}dd)`,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 28,
              animation: "enzo-float 3s ease-in-out infinite",
            }}
          >
            🔮
          </div>
          <div>
            <div style={{ color: "white", fontWeight: 800, fontSize: 15 }}>
              {isComplete ? "Well done!" : STEP_CONFIG[step].title}
            </div>
            {!isComplete && (
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>
                Step {step + 1} of 4
              </div>
            )}
          </div>
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 6, padding: "10px 18px 0", justifyContent: "center" }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: i < step ? APP_MAIN_COLOR : i === step && !isComplete ? APP_MAIN_COLOR + "66" : "#e2e8f0",
                transition: "background-color 0.3s",
              }}
            />
          ))}
        </div>

        {/* Message */}
        <div style={{ padding: "14px 18px 18px", minHeight: 60 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#333" }}>
            {displayedText}
            {typedCount < currentMessage.length && (
              <span style={{ opacity: 0.4 }}>|</span>
            )}
          </p>

          {/* Action buttons */}
          {isComplete && typedCount >= currentMessage.length && (
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                onClick={onDismiss}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  backgroundColor: "#f1f5f9",
                  color: "#333",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                Keep Editing
              </button>
              <button
                onClick={onComplete}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  backgroundColor: APP_MAIN_COLOR,
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                Back to Setup
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
