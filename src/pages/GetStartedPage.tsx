import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { APP_MAIN_COLOR } from "../app/theme";
import { USER_NAME_STORAGE_KEY } from "../app/userProfile";
import { getStorageBackend } from "../app/storageBackend";

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

const QUOTE = "\u201CYour future is built in the unglamorous minutes.\u201D";
const QUOTE_AUTHOR = "— Enzo";
const TYPE_SPEED = 45; // ms per character

export default function GetStartedPage() {
  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState("");
  const [typedCount, setTypedCount] = useState(0);
  const [authorVisible, setAuthorVisible] = useState(false);
  const [buttonVisible, setButtonVisible] = useState(false);
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

  const handleNameSubmit = () => {
    const trimmed = userName.trim();
    if (!trimmed) return;
    getStorageBackend().setItem(USER_NAME_STORAGE_KEY, trimmed);
    setStep(2);
  };

  return (
    <>
    <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
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
            <span style={{ color: APP_MAIN_COLOR }}>EnzAPP</span>
          </div>

          <div
            style={{
              marginTop: 28,
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
              marginTop: 40,
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

      {/* Step 2: Motivational message */}
      {step === 2 && (
        <div style={{ textAlign: "center", maxWidth: 560 }}>
          <div
            style={{
              fontSize: 36,
              fontWeight: 900,
              color: APP_MAIN_COLOR,
              marginBottom: 24,
            }}
          >
            {userName.trim()}
          </div>
          <div
            style={{
              fontSize: 17,
              color: "#333",
              lineHeight: 1.8,
              fontWeight: 500,
            }}
          >
            Welcome to a clearer headspace, <strong style={{ color: APP_MAIN_COLOR }}>{userName.trim()}</strong>. 
            Let's organize your work today so your progress creates its own energy tomorrow. 
            By setting realistic goals and charting your path, we’ll turn a mountain of work into a manageable climb.
          </div>

          <button
            onClick={() => setStep(3)}
            style={{ ...primaryBtnStyle, marginTop: 48 }}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
          >
            Continue
          </button>
        </div>
      )}

      {/* Step 3: Overview cards */}
      {step === 3 && (
        <div style={{ textAlign: "center", maxWidth: 900, width: "100%" }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: "#111",
              marginBottom: 8,
            }}
          >
            How it works
          </div>
          <div
            style={{
              fontSize: 14,
              color: "#64748b",
              marginBottom: 40,
            }}
          >
            Three pages to stay focused and finish what matters.
          </div>

          <div
            style={{
              display: "flex",
              gap: 20,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {cards.map((card) => (
              <div
                key={card.title}
                style={{
                  flex: "1 1 240px",
                  maxWidth: 280,
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: 16,
                  padding: "32px 24px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 16 }}>
                  {card.icon}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: "#111",
                    marginBottom: 10,
                  }}
                >
                  {card.title}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#64748b",
                    lineHeight: 1.6,
                  }}
                >
                  {card.description}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate("/grand-plan")}
            style={{ ...primaryBtnStyle, marginTop: 48 }}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
          >
            Let's Go
          </button>
        </div>
      )}
    </div>
    </>
  );
}
