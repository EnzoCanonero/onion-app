import { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import type { DateISO } from "../app/types";
import {
  loadState,
  saveState,
  getMonth,
  getOrCreateDay,
  ymFromDate,
  makeId,
  addSession,
  updateDay,
  updateSession,
  setDayTasks,
  setTaskOutcome,
  setDailyJournal,
  setPendingNote,
  setShutdownNote,
  findLastWorkingDay,
  activateWorkingDay,
} from "../app/storage";
import TaskSelectionModal from "../components/TaskSelectionModal";
import FocusTemplateCard from "../components/FocusTemplateCard";
import EmptyMonthPanel from "../components/EmptyMonthPanel";

export default function DailyAgendaPage() {
  const { date } = useParams();
  const dateSafe = (date ?? "") as DateISO;
  const ym = ymFromDate(dateSafe);

  const nav = useNavigate();
  const [tick, setTick] = useState(0);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const state = useMemo(() => loadState(), [tick]);

  const plan = getMonth(state, ym);

  // Active month rule (v3): show empty panel if no plan exists
  if (!plan) {
    return (
      <div>
        <h2>Daily Agenda: {dateSafe}</h2>
        <EmptyMonthPanel ym={ym} />
      </div>
    );
  }

  const { state: withDay, day } = getOrCreateDay(state, dateSafe, ym);

  // Persist newly created day entry (only once)
  if (withDay !== state) {
    saveState(withDay);
  }

  const mutate = (fn: (s: typeof withDay) => typeof withDay) => {
    const current = loadState();
    const next = fn(current);
    saveState(next);
    setTick((x) => x + 1);
  };

  const startSession = (templateId: string) => {
    mutate((s0) => {
      const plan0 = getMonth(s0, ym);
      if (!plan0) return s0;

      const { state: withDay0, day: day0 } = getOrCreateDay(s0, dateSafe, ym);
      if (day0.activeSessionId) return withDay0;

      const sessionId = makeId("sess");
      const session = {
        id: sessionId,
        date: dateSafe,
        ym,
        templateId,
        startedAt: new Date().toISOString(),
      };

      let next = addSession(withDay0, session);
      next = updateDay(next, { ...day0, activeSessionId: sessionId });
      return next;
    });
  };

  const endSession = () => {
    mutate((s0) => {
      const { state: withDay0, day: day0 } = getOrCreateDay(s0, dateSafe, ym);
      if (!day0.activeSessionId) return withDay0;

      const session0 = withDay0.sessions.find((s) => s.id === day0.activeSessionId);
      if (!session0?.startedAt) return withDay0;

      const endedAt = new Date().toISOString();
      const ms = Date.parse(endedAt) - Date.parse(session0.startedAt);
      const minutes = Math.max(0, Math.round(ms / 60000));

      let next = updateSession(withDay0, day0.activeSessionId, { endedAt, actualMinutes: minutes });
      next = updateDay(next, { ...day0, activeSessionId: undefined });
      return next;
    });
  };


  // v2: Smart defaults - suggest YELLOW tasks as secondaries (shown in modal)
  const suggestedSecondaryIds = useMemo(() => {
    if (day.secondaryTaskIds.length > 0) return []; // Don't show suggestions if already has selections

    return plan.tasks
      .filter((t) => t.status === "YELLOW" && !t.parentId) // Top-level YELLOW tasks
      .slice(0, 3)
      .map((t) => t.id);
  }, [plan.tasks, day.secondaryTaskIds]);

  // v2: Working day activation
  const handleActivateDay = () => {
    mutate((s0) => activateWorkingDay(s0, dateSafe));
    setShowActivateModal(false);
  };

  const tasksById = useMemo(() => new Map(plan.tasks.map((t) => [t.id, t] as const)), [plan.tasks]);

  const handleTaskSelectionConfirm = (primaryId: string | undefined, secondaryIds: string[]) => {
    mutate((s0) => {
      const { state: withDay0 } = getOrCreateDay(s0, dateSafe, ym);
      return setDayTasks(withDay0, dateSafe, primaryId, secondaryIds);
    });
    setShowTaskModal(false);
  };

  // v2: Last working day info (not just previous day)
  const lastWorkingDay = useMemo(() => findLastWorkingDay(state, dateSafe, ym), [state, dateSafe, ym]);

  const setOutcome = (taskId: string, outcome: "COMPLETED" | "NOT_COMPLETED" | undefined) => {
    mutate((s0) => setTaskOutcome(s0, dateSafe, taskId, outcome));
  };

  const updateJournal = (text: string) => {
    mutate((s0) => setDailyJournal(s0, dateSafe, text || undefined));
  };

  const updatePending = (text: string) => {
    mutate((s0) => setPendingNote(s0, dateSafe, text || undefined));
  };

  const updateShutdown = (text: string) => {
    mutate((s0) => setShutdownNote(s0, dateSafe, text || undefined));
  };

  const clearPending = () => mutate((s0) => setPendingNote(s0, dateSafe, undefined));

  return (
    <div>
      <h2>📅 Daily Agenda: {dateSafe}</h2>
      <p style={{ marginTop: -8, marginBottom: 24, opacity: 0.7 }}>
        Plan your day, track focus sessions, and reflect on progress
      </p>

      {/* v2: Message from Last Working Day - Shutdown note */}
      <div
        style={{
          border: "2px solid #9c27b0",
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          backgroundColor: "#f3e5f5",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 12, color: "#6a1b9a" }}>
          💌 Message from your yesterday self
        </h3>
        {lastWorkingDay?.shutdownNote ? (
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, marginBottom: 12 }}>
            {lastWorkingDay.shutdownNote}
          </div>
        ) : (
          <p style={{ fontStyle: "italic", color: "#7b1fa2", marginBottom: 12 }}>
            Nothing pending from yesterday. Fresh start! Have a great day! 🌟
          </p>
        )}
        {lastWorkingDay && (
          <div style={{ fontSize: 12, color: "#7b1fa2", marginTop: 8 }}>
            From: {lastWorkingDay.date} (last working day)
          </div>
        )}
      </div>

      {/* v2: If day is not activated, show only activation button */}
      {!day.isWorkingDay ? (
        <div style={{ textAlign: "center", padding: 48, border: "2px dashed #ddd", borderRadius: 12 }}>
          <p style={{ fontSize: 18, marginBottom: 24, opacity: 0.8 }}>
            Ready to start your working day?
          </p>
          <button
            onClick={() => setShowActivateModal(true)}
            style={{
              padding: "16px 32px",
              fontSize: 18,
              fontWeight: 600,
              backgroundColor: "#4caf50",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
            }}
          >
            🚀 Start Working Day
          </button>

          {/* Activation Confirmation Modal */}
          {showActivateModal && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
              onClick={() => setShowActivateModal(false)}
            >
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 400,
                  boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>⚠️ Activate Working Day</h3>
                <p style={{ marginBottom: 24, lineHeight: 1.6 }}>
                  This will mark <strong>{dateSafe}</strong> as a working day. This action <strong>cannot be undone</strong>.
                </p>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setShowActivateModal(false)}
                    style={{
                      padding: "8px 16px",
                      fontSize: 14,
                      backgroundColor: "white",
                      border: "1px solid #ddd",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleActivateDay}
                    style={{
                      padding: "8px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      backgroundColor: "#4caf50",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    ✓ Activate
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* All sections below only show when day is activated */}
          <h3>Daily Tasks</h3>

          {/* v2: Task Selection Modal */}
          {showTaskModal && (
            <TaskSelectionModal
              tasks={plan.tasks}
              currentPrimaryId={day.primaryTaskId}
              currentSecondaryIds={day.secondaryTaskIds}
              onConfirm={handleTaskSelectionConfirm}
              onCancel={() => setShowTaskModal(false)}
              suggestedSecondaryIds={suggestedSecondaryIds}
            />
          )}

          {/* Selected Tasks Display */}
          {!day.primaryTaskId ? (
            <div style={{ textAlign: "center", padding: 32, border: "2px dashed #ddd", borderRadius: 8 }}>
              <p style={{ opacity: 0.6, marginBottom: 16 }}>No tasks selected for today</p>
              <button
                onClick={() => setShowTaskModal(true)}
                style={{
                  padding: "12px 24px",
                  fontSize: 16,
                  fontWeight: 600,
                  backgroundColor: "#2196f3",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                📝 Choose Daily Tasks
              </button>
            </div>
          ) : (
            <div>
              {/* Primary Task - Gold Rectangle */}
              <div
            style={{
              border: "3px solid #ffa726",
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
              backgroundColor: "#fff8e1",
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#f57c00", marginBottom: 4 }}>
                🎯 PRIMARY TASK
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                {tasksById.get(day.primaryTaskId)?.title ?? "Unknown"}
              </div>
              {tasksById.get(day.primaryTaskId)?.status !== "NONE" && (
                <span
                  style={{
                    display: "inline-block",
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor:
                      tasksById.get(day.primaryTaskId)?.status === "GREEN"
                        ? "#4caf50"
                        : "#ff9800",
                    border: "2px solid white",
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
                  }}
                  title={tasksById.get(day.primaryTaskId)?.status}
                />
              )}
            </div>

            {/* Outcome Buttons for Primary */}
            {day.primaryTaskId && (() => {
              const task = tasksById.get(day.primaryTaskId);
              const isGreen = task?.status === "GREEN";
              const isYellow = task?.status === "YELLOW";
              return (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#666" }}>
                    Update status:
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => setOutcome(day.primaryTaskId!, "COMPLETED")}
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        fontWeight: 600,
                        backgroundColor: isGreen ? "#4caf50" : "white",
                        color: isGreen ? "white" : "#4caf50",
                        border: `2px solid #4caf50`,
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      ✓ Completed
                    </button>
                    <button
                      onClick={() => setOutcome(day.primaryTaskId!, "NOT_COMPLETED")}
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        fontWeight: 600,
                        backgroundColor: isYellow ? "#ff9800" : "white",
                        color: isYellow ? "white" : "#ff9800",
                        border: `2px solid #ff9800`,
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      ⏳ Work in Progress
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Secondary Tasks */}
          {day.secondaryTaskIds.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#666" }}>
                📌 SECONDARY TASKS ({day.secondaryTaskIds.length})
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {day.secondaryTaskIds.map((id) => {
                  const task = tasksById.get(id);
                  if (!task) return null;
                  return (
                    <div
                      key={id}
                      style={{
                        border: "2px solid #e0e0e0",
                        borderRadius: 8,
                        padding: 12,
                        backgroundColor: "white",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontWeight: 500 }}>{task.title}</div>
                        {task.status !== "NONE" && (
                          <span
                            style={{
                              display: "inline-block",
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              backgroundColor: task.status === "GREEN" ? "#4caf50" : "#ff9800",
                              border: "2px solid white",
                              boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
                            }}
                            title={task.status}
                          />
                        )}
                      </div>

                      {/* Outcome Buttons */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          onClick={() => setOutcome(id, "COMPLETED")}
                          style={{
                            padding: "4px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            backgroundColor: task.status === "GREEN" ? "#4caf50" : "white",
                            color: task.status === "GREEN" ? "white" : "#4caf50",
                            border: `1.5px solid #4caf50`,
                            borderRadius: 4,
                            cursor: "pointer",
                          }}
                        >
                          ✓ Completed
                        </button>
                        <button
                          onClick={() => setOutcome(id, "NOT_COMPLETED")}
                          style={{
                            padding: "4px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            backgroundColor: task.status === "YELLOW" ? "#ff9800" : "white",
                            color: task.status === "YELLOW" ? "white" : "#ff9800",
                            border: `1.5px solid #ff9800`,
                            borderRadius: 4,
                            cursor: "pointer",
                          }}
                        >
                          ⏳ In Progress
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Edit Tasks Button */}
          <button
            onClick={() => setShowTaskModal(true)}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              backgroundColor: "white",
              border: "1px solid #ddd",
              borderRadius: 6,
              cursor: "pointer",
              marginBottom: 16,
            }}
          >
            ✏️ Edit Task Selection
          </button>
            </div>
          )}

          {/* v2: Daily Journal - Persistent notes */}
          <h3 style={{ marginTop: 24 }}>📝 Daily Journal</h3>
          <textarea
            rows={12}
            placeholder="Daily notes, thoughts, observations..."
            value={day.dailyJournal ?? ""}
            onChange={(e) => updateJournal(e.target.value)}
            style={{ padding: 10, fontSize: 14, lineHeight: 1.6, width: "100%", boxSizing: "border-box" }}
          />

          {/* v2: Shutdown Note - Full shutdown summary */}
          <h3 style={{ marginTop: 24 }}>🔒 Shutdown Note</h3>
          <p style={{ fontSize: 13, color: "#666", marginTop: 0 }}>
            Complete shutdown summary (shown next working day)
          </p>
          <textarea
            rows={4}
            placeholder="Full shutdown summary, reflections, detailed notes..."
            value={day.shutdownNote ?? ""}
            onChange={(e) => updateShutdown(e.target.value)}
            style={{ padding: 10, fontSize: 14, lineHeight: 1.6, width: "100%", boxSizing: "border-box" }}
          />

          {/* v2: Focus Sessions - Moved to bottom */}
          <h3 style={{ marginTop: 32 }}>⏱️ Focus Sessions</h3>
          <div style={{ marginBottom: 24 }}>
            {plan.templates.map((template) => (
              <FocusTemplateCard
                key={template.id}
                template={template}
                activeSessionId={day.activeSessionId}
                completedSessions={state.sessions.filter((s) => s.date === dateSafe)}
                onStartSession={startSession}
                onEndSession={endSession}
              />
            ))}
          </div>

          <p style={{ opacity: 0.8, marginTop: 16 }}>
            v2 note: Working days system - Only activated days show all sections. Shutdown note shows on next working day.
          </p>
        </>
      )}
    </div>
  );
}
