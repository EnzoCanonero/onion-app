import { useMemo, useState, useEffect } from "react";
import type { FocusTemplate, ProductivitySession } from "../app/types";

type FocusTemplateCardProps = {
  template: FocusTemplate;
  activeSessionId?: string;
  completedSessions: ProductivitySession[];
  onStartSession: (templateId: string) => void;
  onEndSession: () => void;
};

export default function FocusTemplateCard({
  template,
  activeSessionId,
  completedSessions,
  onStartSession,
  onEndSession,
}: FocusTemplateCardProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  // Update current time every second for progress bar
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const activeSession = useMemo(() => {
    return completedSessions.find((s) => s.id === activeSessionId && s.templateId === template.id);
  }, [completedSessions, activeSessionId, template.id]);

  // Calculate planned duration in minutes
  const [startHour, startMin] = template.plannedStart.split(":").map(Number);
  const [endHour, endMin] = template.plannedEnd.split(":").map(Number);
  const plannedMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);

  // Calculate elapsed time if session is active
  const elapsedMinutes = useMemo(() => {
    if (!activeSession?.startedAt) return 0;
    const startTime = new Date(activeSession.startedAt).getTime();
    const elapsed = Math.floor((currentTime.getTime() - startTime) / 60000);
    return Math.max(0, elapsed);
  }, [activeSession, currentTime]);

  // Progress percentage
  const progressPercentage = activeSession
    ? Math.min(100, (elapsedMinutes / plannedMinutes) * 100)
    : 0;

  // Find completed session for this template today
  const completedSession = completedSessions.find(
    (s) => s.templateId === template.id && s.endedAt && !activeSession
  );

  // Completed session percentage (actual vs planned)
  const completedPercentage = completedSession
    ? Math.min(100, ((completedSession.actualMinutes ?? 0) / plannedMinutes) * 100)
    : 0;

  const handleStartClick = () => {
    setShowStartConfirm(true);
  };

  const confirmStart = () => {
    onStartSession(template.id);
    setShowStartConfirm(false);
  };

  const handleStopClick = () => {
    setShowStopConfirm(true);
  };

  const confirmStop = () => {
    onEndSession();
    setShowStopConfirm(false);
  };

  return (
    <div
      style={{
        border: "2px solid #e0e0e0",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        backgroundColor: activeSession ? "#fff8e1" : completedSession ? "#e8f5e9" : "white",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{template.title}</div>
          <div style={{ fontSize: 13, color: "#666" }}>
            📅 Planned: {template.plannedStart} - {template.plannedEnd} ({plannedMinutes} min)
          </div>
        </div>

        {/* Play/Stop Button - Hide Play if completed */}
        {completedSession ? null : activeSession ? (
          <button
            onClick={handleStopClick}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 600,
              backgroundColor: "#f44336",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ⏹ Stop
          </button>
        ) : (
          <button
            onClick={handleStartClick}
            disabled={!!activeSessionId}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 600,
              backgroundColor: activeSessionId ? "#ccc" : "#4caf50",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: activeSessionId ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ▶ Start
          </button>
        )}
      </div>

      {/* Progress Bar - Show always (grey before start, green during/after) */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            width: "100%",
            height: 24,
            backgroundColor: "#e0e0e0",
            borderRadius: 12,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              width: completedSession
                ? `${completedPercentage}%`
                : activeSession
                  ? `${progressPercentage}%`
                  : "0%",
              height: "100%",
              backgroundColor: completedSession || activeSession ? "#4caf50" : "#e0e0e0",
              transition: "width 1s linear",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 600,
              color: completedSession
                ? completedPercentage > 50 ? "white" : "#333"
                : activeSession && progressPercentage > 50
                  ? "white"
                  : "#333",
            }}
          >
            {completedSession
              ? `✓ ${completedSession.actualMinutes} / ${plannedMinutes} min`
              : activeSession
                ? `${elapsedMinutes} / ${plannedMinutes} min`
                : `0 / ${plannedMinutes} min`}
          </div>
        </div>
      </div>

      {/* Completed Session Time Info */}
      {completedSession && (
        <div
          style={{
            fontSize: 12,
            color: "#666",
            textAlign: "center",
          }}
        >
          {new Date(completedSession.startedAt).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}{" "}
          -{" "}
          {completedSession.endedAt
            ? new Date(completedSession.endedAt).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })
            : "—"}
        </div>
      )}

      {/* Start Confirmation Modal */}
      {showStartConfirm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowStartConfirm(false)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: 12 }}>Start Focus Session?</h3>
            <p style={{ margin: 0, marginBottom: 16, color: "#666" }}>
              Starting "{template.title}" session. This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowStartConfirm(false)}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "white",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmStart}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#4caf50",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Start Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stop Confirmation Modal */}
      {showStopConfirm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowStopConfirm(false)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: 12 }}>End Focus Session?</h3>
            <p style={{ margin: 0, marginBottom: 16, color: "#666" }}>
              You've completed {elapsedMinutes} minutes of the planned {plannedMinutes} minutes. This action cannot be
              undone.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowStopConfirm(false)}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "white",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmStop}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#f44336",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
