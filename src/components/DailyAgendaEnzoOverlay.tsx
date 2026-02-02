import { useEffect, useRef, useState } from "react";
import { APP_MAIN_COLOR } from "../app/theme";

type TutorialStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const STEP_CONFIG: Record<number, { title: string; message: string; target: string }> = {
  0: {
    title: "Start Your Day",
    message: "Click \"Start Working Day\" to open your daily setup wizard.",
    target: "start-day",
  },
  1: {
    title: "Choose a Primary Task",
    message: "Pick the primary task you want to focus on today.",
    target: "wizard-primary-task",
  },
  2: {
    title: "Next: Meetings",
    message: "Great choice! Click \"Next\" to move to your meetings.",
    target: "wizard-next",
  },
  3: {
    title: "Add a Meeting (Optional)",
    message: "Add a meeting for today, or click \"Next\" to skip.",
    target: "wizard-meeting-add",
  },
  4: {
    title: "Continue to Focus Sessions",
    message: "If your meetings look good, click \"Next\" to review focus sessions.",
    target: "wizard-next",
  },
  5: {
    title: "Review Focus Sessions",
    message: "Review today's focus sessions, then click \"Start Day\" to finalize.",
    target: "wizard-start-day",
  },
  6: {
    title: "Review Your Day",
    message: "Review your daily plan and adjust anything that feels off.",
    target: "daily-plan-review",
  },
};

type DailyAgendaEnzoOverlayProps = {
  tick: number;
  dismissed: boolean;
  onDismiss: () => void;
  onComplete: () => void;
  isWorkingDay: boolean;
  wizardOpen: boolean;
  wizardStep: number;
  primarySelected: boolean;
  meetingCount: number;
  focusSessionCount: number;
};

function deriveStep(props: DailyAgendaEnzoOverlayProps): TutorialStep {
  if (!props.isWorkingDay) return 0;
  if (props.wizardOpen) {
    if (props.wizardStep === 0) return props.primarySelected ? 2 : 1;
    if (props.wizardStep === 1) return props.meetingCount === 0 ? 3 : 4;
    return 5;
  }
  return 6;
}

export default function DailyAgendaEnzoOverlay(props: DailyAgendaEnzoOverlayProps) {
  const { tick, dismissed, onDismiss, onComplete } = props;
  const step = deriveStep(props);
  const [typedCount, setTypedCount] = useState(0);
  const [prevStep, setPrevStep] = useState<TutorialStep>(step);
  const highlightRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (step !== prevStep) {
      setTypedCount(0);
      setPrevStep(step);
    }
  }, [step, prevStep]);

  const focusMessage = props.focusSessionCount > 0
    ? "Review today's focus sessions, then click \"Start Day\" to finalize."
    : "No focus sessions scheduled. Click \"Start Day\" to finalize.";

  const currentMessage = step === 5
    ? focusMessage
    : STEP_CONFIG[step].message;

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

  useEffect(() => {
    const clearHighlight = (el: HTMLElement) => {
      el.style.removeProperty("box-shadow");
      el.style.removeProperty("animation");
      el.style.removeProperty("transition");
      el.style.removeProperty("position");
      el.style.removeProperty("z-index");
    };

    if (dismissed || step >= 6) {
      if (highlightRef.current) {
        clearHighlight(highlightRef.current);
        highlightRef.current = null;
      }
      return;
    }

    const target = STEP_CONFIG[step].target;
    const tryHighlight = () => {
      const el = document.querySelector(`[data-tutorial-target="${target}"]`) as HTMLElement | null;
      if (highlightRef.current && highlightRef.current !== el) {
        clearHighlight(highlightRef.current);
      }
      if (el) {
        el.style.transition = "none";
        el.style.boxShadow = `0 0 0 3px ${APP_MAIN_COLOR}, 0 0 16px ${APP_MAIN_COLOR}66`;
        el.style.animation = "enzo-pulse 1.5s ease-in-out infinite";
        el.style.position = "relative";
        el.style.zIndex = "10";
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        highlightRef.current = el;
      }
    };

    const timeout = setTimeout(tryHighlight, 300);
    return () => {
      clearTimeout(timeout);
      if (highlightRef.current) {
        clearHighlight(highlightRef.current);
        highlightRef.current = null;
      }
    };
  }, [step, dismissed, tick]);

  if (dismissed) return null;

  const displayedText = currentMessage.slice(0, typedCount);
  const isComplete = step === 6;
  const totalSteps = 7;

  return (
    <>
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
              {STEP_CONFIG[step].title}
            </div>
            {!isComplete && (
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>
                Step {step + 1} of {totalSteps}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "10px 18px 0", justifyContent: "center" }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor:
                  i < step
                    ? APP_MAIN_COLOR
                    : i === step && !isComplete
                    ? APP_MAIN_COLOR + "66"
                    : "#e2e8f0",
                transition: "background-color 0.3s",
              }}
            />
          ))}
        </div>

        <div style={{ padding: "14px 18px 18px", minHeight: 60 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#333" }}>
            {displayedText}
            {typedCount < currentMessage.length && <span style={{ opacity: 0.4 }}>|</span>}
          </p>

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
