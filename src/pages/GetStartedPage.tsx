import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { APP_MAIN_COLOR } from "../app/theme";
import { USER_NAME_STORAGE_KEY } from "../app/userProfile";
import { getStorageBackend } from "../app/storageBackend";
import { loadOnboarding } from "../app/onboarding";
import onionGraphic from "../assets/onion.svg";

const cards = [
  {
    icon: "🗺️",
    title: "Grand Plan",
    description:
      "Define your categories and milestones. Set big-picture goals and track progress across your entire plan.",
  },
  {
    icon: "📋",
    title: "Month Setup",
    description:
      "Pin milestones to a month, set your objective, and organize tasks on a visual whiteboard.",
  },
  {
    icon: "☀️",
    title: "Daily Agenda",
    description:
      "Focus on today: pick your tasks, run focus sessions, and track your daily progress.",
  },
];

const primaryBtnStyle: React.CSSProperties = {
  padding: "14px 40px",
  fontSize: 16,
  fontWeight: 800,
  color: "white",
  backgroundColor: APP_MAIN_COLOR,
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  boxShadow: "0 8px 24px rgba(103, 58, 183, 0.35)",
  transition: "transform 120ms ease, box-shadow 120ms ease",
};

function hoverIn(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.transform = "translateY(-2px)";
  e.currentTarget.style.boxShadow = "0 12px 32px rgba(103, 58, 183, 0.4)";
}
function hoverOut(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "0 8px 24px rgba(103, 58, 183, 0.35)";
}

const QUOTE = "\u201CNo onions, no flavor. No plan, no progress. Cry if you must, but keep chopping.\u201D";
const QUOTE_AUTHOR = "— Enzo";
const TYPE_SPEED = 45; // ms per character

type JourneyCard = {
  icon: string;
  title: string;
  description: string;
  unlocked: boolean;
  done: boolean;
};

function TutorialJourneySection({
  visible,
  cards,
  allDone,
  onCardClick,
  onEnter,
}: {
  visible: boolean;
  cards: JourneyCard[];
  allDone: boolean;
  onCardClick: (index: number) => void;
  onEnter: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 24,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 300ms ease, transform 300ms ease",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 20,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {cards.map((card, i) => {
          const isLocked = !card.unlocked;
          const isDone = card.done;
          return (
            <div
              key={card.title}
              onClick={() => {
                if (isLocked) return;
                onCardClick(i);
              }}
              style={{
                flex: "1 1 240px",
                maxWidth: 280,
                backgroundColor: isLocked ? "#f8fafc" : "white",
                border: isLocked
                  ? "1px solid #e2e8f0"
                  : isDone
                  ? `2px solid ${APP_MAIN_COLOR}`
                  : `2px solid ${APP_MAIN_COLOR}88`,
                borderRadius: 16,
                padding: "32px 24px",
                boxShadow: isLocked
                  ? "none"
                  : isDone
                  ? `0 4px 16px ${APP_MAIN_COLOR}22`
                  : "0 2px 8px rgba(0,0,0,0.06)",
                textAlign: "center",
                cursor: isLocked ? "not-allowed" : "pointer",
                opacity: isLocked ? 0.5 : 1,
                transition: "all 0.2s ease",
                position: "relative" as const,
              }}
              onMouseEnter={(e) => {
                if (isLocked) return;
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = `0 8px 24px ${APP_MAIN_COLOR}33`;
              }}
              onMouseLeave={(e) => {
                if (isLocked) return;
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = isDone
                  ? `0 4px 16px ${APP_MAIN_COLOR}22`
                  : "0 2px 8px rgba(0,0,0,0.06)";
              }}
            >
              {isDone && (
                <div
                  style={{
                    position: "absolute",
                    top: -10,
                    right: -10,
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    backgroundColor: "#4caf50",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  ✓
                </div>
              )}
              {isLocked && (
                <div
                  style={{
                    position: "absolute",
                    top: -10,
                    right: -10,
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    backgroundColor: "#94a3b8",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                  }}
                >
                  🔒
                </div>
              )}

              <div style={{ fontSize: 36, marginBottom: 16 }}>{card.icon}</div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: isLocked ? "#94a3b8" : "#111",
                  marginBottom: 10,
                }}
              >
                {card.title}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: isLocked ? "#cbd5e1" : "#64748b",
                  lineHeight: 1.6,
                }}
              >
                {card.description}
              </div>

              {!isLocked && (
                <div
                  style={{
                    marginTop: 16,
                    fontSize: 13,
                    fontWeight: 700,
                    color: APP_MAIN_COLOR,
                  }}
                >
                  {isDone ? "Open →" : "Start →"}
                </div>
              )}
            </div>
          );
        })}

        <div
          style={{
            width: "100%",
            marginTop: 48,
            display: "flex",
            justifyContent: "center",
            minHeight: 56,
            alignItems: "center",
          }}
        >
          <button
            onClick={onEnter}
            style={{
              ...primaryBtnStyle,
              visibility: allDone ? "visible" : "hidden",
              pointerEvents: allDone ? "auto" : "none",
            }}
            onMouseEnter={allDone ? hoverIn : undefined}
            onMouseLeave={allDone ? hoverOut : undefined}
            aria-hidden={!allDone}
            tabIndex={allDone ? 0 : -1}
          >
            Enter OnionOps
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GetStartedPage() {
  const location = useLocation();
  const initialStep = (location.state as { step?: number } | null)?.step ?? 0;
  const [step, setStep] = useState(initialStep);
  const [userName, setUserName] = useState("");
  const [typedCount, setTypedCount] = useState(0);
  const [authorVisible, setAuthorVisible] = useState(false);
  const [buttonVisible, setButtonVisible] = useState(false);
  const [journeyCardsVisible, setJourneyCardsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  // Typewriter effect for step 0
  useEffect(() => {
    if (step !== 0) return;
    if (typedCount < QUOTE.length) {
      timerRef.current = setTimeout(() => setTypedCount((c) => c + 1), TYPE_SPEED);
    } else if (!authorVisible) {
      timerRef.current = setTimeout(() => setAuthorVisible(true), 500);
    } else if (!buttonVisible) {
      timerRef.current = setTimeout(() => setButtonVisible(true), 2000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [step, typedCount, authorVisible, buttonVisible]);

  useEffect(() => {
    if (step < 2) {
      setJourneyCardsVisible(false);
      return;
    }
    let alreadyShown = false;
    try {
      alreadyShown = window.localStorage.getItem("focustree:get-started:panels-shown") === "true";
    } catch {
      alreadyShown = false;
    }
    if (alreadyShown) {
      setJourneyCardsVisible(true);
      return;
    }
    const t = setTimeout(() => {
      setJourneyCardsVisible(true);
      try {
        window.localStorage.setItem("focustree:get-started:panels-shown", "true");
      } catch {
        // ignore
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [step]);

  const handleNameSubmit = () => {
    const trimmed = userName.trim();
    if (!trimmed) return;
    getStorageBackend().setItem(USER_NAME_STORAGE_KEY, trimmed);
    setStep(2);
  };

  useEffect(() => {
    if (step < 2) return;
    if (userName.trim()) return;
    const stored = getStorageBackend().getItem(USER_NAME_STORAGE_KEY);
    if (stored && stored.trim()) {
      setUserName(stored.trim());
    }
  }, [step, userName]);

  const showJourneyCards = journeyCardsVisible;
  const onboarding = loadOnboarding();
  const journeyCards: JourneyCard[] = [
    { ...cards[0], unlocked: true, done: onboarding.grandPlanTutorialComplete },
    { ...cards[1], unlocked: onboarding.grandPlanTutorialComplete, done: onboarding.monthSetupTutorialComplete },
    { ...cards[2], unlocked: onboarding.monthSetupTutorialComplete, done: onboarding.dailyAgendaTutorialComplete },
  ];
  const allJourneysDone = journeyCards.every((c) => c.done);

  return (
    <>
    <style>{`
      @keyframes blink { 50% { opacity: 0; } }
    `}</style>
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        backgroundColor: "#fafbfc",
        padding: 32,
        boxSizing: "border-box",
      }}
    >
      {/* Step 0: Welcome */}
      {step === 0 && (
        <div style={{ textAlign: "center", maxWidth: 520 }}>
          <div
            style={{
              fontSize: 48,
              fontWeight: 900,
              color: "#111",
              letterSpacing: "-1px",
              lineHeight: 1.1,
            }}
          >
            Welcome to{" "}
            <span style={{ color: APP_MAIN_COLOR }}>OnionOps</span>
          </div>

          <div
            style={{
              marginTop: 22,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <img
              src={onionGraphic}
              alt="Onion illustration"
              style={{
                width: 120,
                height: 120,
                objectFit: "contain",
              }}
            />
          </div>

          <div
            style={{
              marginTop: 44,
              fontSize: 16,
              fontWeight: 500,
              color: "#64748b",
              fontStyle: "italic",
              lineHeight: 1.7,
              minHeight: 52,
            }}
          >
            {QUOTE.slice(0, typedCount)}
            {typedCount < QUOTE.length && (
              <span style={{
                display: "inline-block",
                width: 2,
                height: 18,
                backgroundColor: APP_MAIN_COLOR,
                marginLeft: 1,
                verticalAlign: "text-bottom",
                animation: "blink 0.8s step-end infinite",
              }} />
            )}
            {typedCount >= QUOTE.length && (
              <span style={{
                opacity: authorVisible ? 1 : 0,
                transition: "opacity 400ms ease",
              }}>
                {" "}{QUOTE_AUTHOR}
              </span>
            )}
          </div>

          <div
            style={{
              marginTop: 12,
              opacity: buttonVisible ? 1 : 0,
              transform: buttonVisible ? "translateY(0)" : "translateY(8px)",
              transition: "opacity 400ms ease, transform 400ms ease",
            }}
          >
            <button
              onClick={() => setStep(1)}
              style={primaryBtnStyle}
              onMouseEnter={hoverIn}
              onMouseLeave={hoverOut}
            >
              Get Started
            </button>
          </div>
        </div>
      )}

      {/* Step 1: What's your name? */}
      {step === 1 && (
        <div style={{ textAlign: "center", maxWidth: 440 }}>
          <div
            style={{
              fontSize: 32,
              fontWeight: 900,
              color: "#111",
              marginBottom: 8,
            }}
          >
            Before we begin...
          </div>
          <div
            style={{
              fontSize: 16,
              color: "#64748b",
              marginBottom: 36,
            }}
          >
            What's your name?
          </div>

          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNameSubmit();
            }}
            placeholder="Enter your name"
            autoFocus
            style={{
              width: "100%",
              maxWidth: 320,
              padding: "14px 18px",
              fontSize: 18,
              fontWeight: 700,
              textAlign: "center",
              border: `2px solid #e2e8f0`,
              borderRadius: 12,
              outline: "none",
              color: "#111",
              boxSizing: "border-box",
              transition: "border-color 150ms ease",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = APP_MAIN_COLOR;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#e2e8f0";
            }}
          />

          <div style={{ marginTop: 32 }}>
            <button
              onClick={handleNameSubmit}
              disabled={!userName.trim()}
              style={{
                ...primaryBtnStyle,
                opacity: userName.trim() ? 1 : 0.45,
                cursor: userName.trim() ? "pointer" : "not-allowed",
              }}
              onMouseEnter={userName.trim() ? hoverIn : undefined}
              onMouseLeave={userName.trim() ? hoverOut : undefined}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Motivational message + tutorial cards */}
      {(step === 2 || step === 3) && (
        <div style={{ textAlign: "center", maxWidth: 980, width: "100%" }}>
          <div style={{ maxWidth: 560, margin: "0 auto", position: "relative", transform: "translateY(-45px)" }}>
            <div
              style={{
                fontSize: 36,
                fontWeight: 500,
                color: "#111",
                marginBottom: 24,
                position: "relative",
                zIndex: 1,
              }}
            >
              Hi,{" "}
              <span style={{ color: APP_MAIN_COLOR, fontWeight: 900 }}>
                {userName.trim()}
              </span>
            </div>
            <div
              aria-hidden
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 18,
                position: "relative",
                zIndex: 1,
              }}
            >
              <svg width="220" height="54" viewBox="0 0 220 54">
                <defs>
                  <linearGradient id="ink" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#2f2f2f" stopOpacity="0.12" />
                    <stop offset="50%" stopColor="#2f2f2f" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#2f2f2f" stopOpacity="0.12" />
                  </linearGradient>
                  <radialGradient id="sun" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#f9d5a7" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#f9d5a7" stopOpacity="0.1" />
                  </radialGradient>
                </defs>
                <circle cx="110" cy="26" r="10" fill="url(#sun)" />
                <path
                  d="M5 28 C 40 18, 80 40, 115 28 C 150 16, 180 36, 215 26"
                  fill="none"
                  stroke="url(#ink)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <path
                  d="M10 34 C 55 28, 85 40, 120 34 C 155 28, 175 40, 210 34"
                  fill="none"
                  stroke="url(#ink)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div
              style={{
                fontSize: 16,
                color: "#333",
                lineHeight: 1.6,
                fontWeight: 500,
                position: "relative",
                zIndex: 1,
              }}
            >
              OnionOps works in layers: Grand Plan → Month Setup → Daily Agenda. Start with the big
              picture, pin your objective for the month, then choose today’s tasks and focus sessions.
            </div>
          </div>

          <TutorialJourneySection
            visible={showJourneyCards}
            cards={journeyCards}
            allDone={allJourneysDone}
            onCardClick={(i) => {
              if (i === 0) navigate("/grand-plan/tutorial");
              if (i === 1) navigate("/month-setup/tutorial");
              if (i === 2) navigate("/daily-agenda/tutorial");
            }}
            onEnter={() => navigate("/grand-plan")}
          />
        </div>
      )}
    </div>
    </>
  );
}
