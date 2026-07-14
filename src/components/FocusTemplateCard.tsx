import { useMemo, useState, useEffect } from "react";
import type { FocusTemplate, ProductivitySession } from "../app/types";
import { APP_MAIN_COLOR } from "../app/theme";
import { formatWeekdays } from "../app/weekdays";
import { getVirtualNow } from "../contexts/VirtualClockContext";

type FocusTemplateCardProps = {
  template: FocusTemplate;
  activeSessionId?: string;
  completedSessions: ProductivitySession[];
  onStartSession?: (templateId: string) => void;
  onEndSession?: () => void;
  onEditCompletedSession?: (sessionId: string, startedAt: string, endedAt: string) => void;
  accentColor?: string;
  milestoneTitle?: string;
  milestoneOptions?: { id: string; title: string; disabled?: boolean }[];
  selectedMilestoneId?: string;
  onChangeMilestoneId?: (milestoneId: string | undefined) => void;
  isSkipped?: boolean;
  onToggleSkipped?: () => void;
  onReschedule?: (override: { plannedStart: string; plannedEnd: string }) => void;
  onClearReschedule?: () => void;
  hasOverride?: boolean;
};

export default function FocusTemplateCard({
  template,
  activeSessionId,
  completedSessions,
  onStartSession,
  onEndSession,
  onEditCompletedSession,
  accentColor,
  milestoneTitle,
  milestoneOptions,
  selectedMilestoneId,
  onChangeMilestoneId,
  isSkipped,
  onToggleSkipped,
  onReschedule,
  onClearReschedule,
  hasOverride,
}: FocusTemplateCardProps) {
  const [currentTime, setCurrentTime] = useState(() => getVirtualNow());
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleStart, setRescheduleStart] = useState(template.plannedStart);
  const [rescheduleEnd, setRescheduleEnd] = useState(template.plannedEnd);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [showSessionEdit, setShowSessionEdit] = useState(false);
  const [sessionEditStart, setSessionEditStart] = useState("");
  const [sessionEditEnd, setSessionEditEnd] = useState("");
  const [sessionEditError, setSessionEditError] = useState<string | null>(null);

  // Update current time every second for progress bar (uses virtual time in dev mode)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getVirtualNow());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setRescheduleStart(template.plannedStart);
    setRescheduleEnd(template.plannedEnd);
  }, [template.plannedStart, template.plannedEnd]);

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

  const toTimeInputValue = (iso: string | undefined): string => {
    if (!iso) return "";
    const d = new Date(iso);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  };

  const withTimeApplied = (baseIso: string, hhmm: string): string | null => {
    const [h, m] = hhmm.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    const d = new Date(baseIso);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  // Completed session percentage (actual vs planned)
  const completedPercentage = completedSession
    ? Math.min(100, ((completedSession.actualMinutes ?? 0) / plannedMinutes) * 100)
    : 0;

  const handleStartClick = () => {
    if (!onStartSession) return;
    setShowStartConfirm(true);
  };

  const confirmStart = () => {
    onStartSession?.(template.id);
    setShowStartConfirm(false);
  };

  const handleStopClick = () => {
    if (!onEndSession) return;
    setShowStopConfirm(true);
  };

  const confirmStop = () => {
    onEndSession?.();
    setShowStopConfirm(false);
  };

  const handleRescheduleSave = () => {
    const [startHour, startMin] = rescheduleStart.split(":").map(Number);
    const [endHour, endMin] = rescheduleEnd.split(":").map(Number);
    if ([startHour, startMin, endHour, endMin].some((v) => Number.isNaN(v))) {
      setRescheduleError("Invalid time format.");
      return;
    }
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    if (endMinutes <= startMinutes) {
      setRescheduleError("End time must be after start time.");
      return;
    }
    setRescheduleError(null);
    onReschedule?.({ plannedStart: rescheduleStart, plannedEnd: rescheduleEnd });
    setShowReschedule(false);
  };

  const handleToggleSessionEdit = () => {
    if (!completedSession?.endedAt || !onEditCompletedSession) return;
    if (!showSessionEdit) {
      setSessionEditStart(toTimeInputValue(completedSession.startedAt));
      setSessionEditEnd(toTimeInputValue(completedSession.endedAt));
      setSessionEditError(null);
    }
    setShowSessionEdit((v) => !v);
  };

  const handleSessionEditSave = () => {
    if (!completedSession?.endedAt || !onEditCompletedSession) return;
    const nextStartedAt = withTimeApplied(completedSession.startedAt, sessionEditStart);
    const nextEndedAt = withTimeApplied(completedSession.endedAt, sessionEditEnd);
    if (!nextStartedAt || !nextEndedAt) {
      setSessionEditError("Invalid time format.");
      return;
    }
    const startMs = Date.parse(nextStartedAt);
    const endMs = Date.parse(nextEndedAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      setSessionEditError("End time must be after start time.");
      return;
    }
    onEditCompletedSession(completedSession.id, nextStartedAt, nextEndedAt);
    setSessionEditError(null);
    setShowSessionEdit(false);
  };

  const stripeColor = accentColor ?? APP_MAIN_COLOR;
  const barPercent = completedSession ? completedPercentage : activeSession ? progressPercentage : 0;
  const barLabel = completedSession
    ? `✓ ${completedSession.actualMinutes ?? 0} / ${plannedMinutes} min`
    : activeSession
      ? `${elapsedMinutes} / ${plannedMinutes} min`
      : `0 / ${plannedMinutes} min`;

  const showSessionControls = Boolean(onStartSession && onEndSession);
  const canShowSkip = Boolean(onToggleSkipped && !completedSession);
  const canShowEditSession = Boolean(completedSession && onEditCompletedSession);
  const showTopActions = Boolean(onReschedule || canShowSkip || canShowEditSession);

  return (
    <div
      style={{
        border: "1px solid #eee",
        borderLeft: `6px solid ${stripeColor}`,
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        backgroundColor: isSkipped ? "#f8fafc" : "white",
        boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        opacity: isSkipped ? 0.72 : 1,
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
          {hasOverride ? (
            <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: "#b45309" }}>
              Custom schedule for today
            </div>
          ) : null}
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

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          {showTopActions && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {onReschedule ? (
                <button
                  type="button"
                  onClick={() => setShowReschedule((v) => !v)}
                  style={{
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                    backgroundColor: "white",
                    color: "#444",
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  Reschedule
                </button>
              ) : null}
              {canShowSkip ? (
                <button
                  type="button"
                  onClick={onToggleSkipped}
                  style={{
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                    backgroundColor: isSkipped ? "#e5e7eb" : "white",
                    color: isSkipped ? "#555" : "#b45309",
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  {isSkipped ? "Unskip" : "Skip"}
                </button>
              ) : null}
              {canShowEditSession ? (
                <button
                  type="button"
                  onClick={handleToggleSessionEdit}
                  style={{
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                    backgroundColor: showSessionEdit ? "#e6f0ff" : "white",
                    color: "#1d4ed8",
                    border: "1px solid #bfdbfe",
                    borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  {showSessionEdit ? "Close Edit" : "Edit"}
                </button>
              ) : null}
            </div>
          )}

          {showSessionControls ? (
            completedSession ? null : activeSession ? (
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
                disabled={!!activeSessionId || isSkipped}
                style={{
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 900,
                  backgroundColor: activeSessionId || isSkipped ? "#e5e7eb" : stripeColor,
                  color: activeSessionId || isSkipped ? "#9ca3af" : "white",
                  border: "none",
                  borderRadius: 10,
                  cursor: activeSessionId || isSkipped ? "not-allowed" : "pointer",
                  boxShadow: activeSessionId || isSkipped ? "none" : "0 10px 22px rgba(0,0,0,0.10)",
                }}
              >
                Start
              </button>
            )
          ) : null}
        </div>
      </div>

      {showReschedule && onReschedule ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #eee",
            backgroundColor: "rgba(255,255,255,0.9)",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: "#555" }}>Start</label>
              <input
                type="time"
                value={rescheduleStart}
                onChange={(e) => setRescheduleStart(e.target.value)}
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  fontSize: 12,
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: "#555" }}>End</label>
              <input
                type="time"
                value={rescheduleEnd}
                onChange={(e) => setRescheduleEnd(e.target.value)}
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  fontSize: 12,
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <button
                type="button"
                onClick={handleRescheduleSave}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 800,
                  backgroundColor: stripeColor,
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                Save
              </button>
              {onClearReschedule && hasOverride ? (
                <button
                  type="button"
                  onClick={() => {
                    onClearReschedule();
                    setShowReschedule(false);
                  }}
                  style={{
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                    backgroundColor: "white",
                    color: "#444",
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  Reset
                </button>
              ) : null}
            </div>
          </div>
          {rescheduleError ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#ef4444" }}>{rescheduleError}</div>
          ) : null}
        </div>
      ) : null}

      {showSessionEdit && completedSession && onEditCompletedSession ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #dbeafe",
            backgroundColor: "#f8fbff",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: "#555" }}>Start</label>
              <input
                type="time"
                value={sessionEditStart}
                onChange={(e) => setSessionEditStart(e.target.value)}
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid #bfdbfe",
                  fontSize: 12,
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: "#555" }}>End</label>
              <input
                type="time"
                value={sessionEditEnd}
                onChange={(e) => setSessionEditEnd(e.target.value)}
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid #bfdbfe",
                  fontSize: 12,
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <button
                type="button"
                onClick={handleSessionEditSave}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 800,
                  backgroundColor: "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSessionEdit(false);
                  setSessionEditError(null);
                }}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 800,
                  backgroundColor: "white",
                  color: "#444",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
          {sessionEditError ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#ef4444" }}>{sessionEditError}</div>
          ) : null}
        </div>
      ) : null}

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
