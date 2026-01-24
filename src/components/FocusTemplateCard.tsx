import { useMemo, useState, useEffect } from "react";
import type { FocusTemplate, ProductivitySession } from "../app/types";
import { APP_MAIN_COLOR } from "../app/theme";
import { formatWeekdays } from "../app/weekdays";
import { getVirtualNow } from "../contexts/VirtualClockContext";

type FocusTemplateCardProps = {
  template: FocusTemplate;
  activeSessionId?: string;
  completedSessions: ProductivitySession[];
  onStartSession: (templateId: string) => void;
  onEndSession: () => void;
  accentColor?: string;
  milestoneTitle?: string;
  milestoneOptions?: { id: string; title: string; disabled?: boolean }[];
  selectedMilestoneId?: string;
  onChangeMilestoneId?: (milestoneId: string | undefined) => void;
};

export default function FocusTemplateCard({
  template,
  activeSessionId,
  completedSessions,
  onStartSession,
  onEndSession,
  accentColor,
  milestoneTitle,
  milestoneOptions,
  selectedMilestoneId,
  onChangeMilestoneId,
}: FocusTemplateCardProps) {
  const [currentTime, setCurrentTime] = useState(() => getVirtualNow());
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  // Update current time every second for progress bar (uses virtual time in dev mode)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getVirtualNow());
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

  const stripeColor = accentColor ?? APP_MAIN_COLOR;
  const barPercent = completedSession ? completedPercentage : activeSession ? progressPercentage : 0;
  const barLabel = completedSession
    ? `✓ ${completedSession.actualMinutes ?? 0} / ${plannedMinutes} min`
    : activeSession
      ? `${elapsedMinutes} / ${plannedMinutes} min`
      : `0 / ${plannedMinutes} min`;

  return (
    <div
      style={{
        border: "1px solid #eee",
        borderLeft: `6px solid ${stripeColor}`,
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        backgroundColor: "white",
        boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
      }}
    >
      {/* Header */}
	      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          {milestoneTitle ? (
            <div style={{ fontSize: 11, fontWeight: 900, color: stripeColor, marginBottom: 8, letterSpacing: 0.2 }}>
              {milestoneTitle}
            </div>
          ) : null}
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4, color: "#111" }}>{template.title}</div>
          <div style={{ fontSize: 13, color: "#666" }}>
            {template.plannedStart}–{template.plannedEnd} · {plannedMinutes} min · {formatWeekdays(template.daysOfWeek)}
          </div>
          {milestoneOptions && onChangeMilestoneId ? (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#666" }}>Link to:</span>
              <select
                value={selectedMilestoneId ?? ""}
                onChange={(e) => onChangeMilestoneId(e.target.value ? e.target.value : undefined)}
                style={{
                  padding: "7px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  backgroundColor: "white",
                  color: "#333",
                  fontSize: 12,
                  fontWeight: 700,
                  outline: "none",
                }}
              >
                <option value="">No milestone</option>
                {milestoneOptions.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.disabled}>
                    {m.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {/* Play/Stop Button - Hide Play if completed */}
        {completedSession ? null : activeSession ? (
          <button
            onClick={handleStopClick}
            style={{
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 900,
              backgroundColor: "white",
              color: "#ef4444",
              border: "1px solid #ef4444",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleStartClick}
            disabled={!!activeSessionId}
            style={{
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 900,
              backgroundColor: activeSessionId ? "#e5e7eb" : stripeColor,
              color: activeSessionId ? "#9ca3af" : "white",
              border: "none",
              borderRadius: 10,
              cursor: activeSessionId ? "not-allowed" : "pointer",
              boxShadow: activeSessionId ? "none" : "0 10px 22px rgba(0,0,0,0.10)",
            }}
          >
            Start
          </button>
        )}
      </div>

      {/* Progress */}
      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#555" }}>{barLabel}</div>
          <div style={{ fontSize: 12, color: "#666" }}>
            {activeSession ? "In progress" : completedSession ? "Completed" : "Planned"}
          </div>
        </div>
        <div style={{ width: "100%", height: 8, backgroundColor: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
          <div
            style={{
              width: `${barPercent}%`,
              height: "100%",
              backgroundColor: activeSession || completedSession ? stripeColor : "#e5e7eb",
              transition: "width 300ms ease",
            }}
          />
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
