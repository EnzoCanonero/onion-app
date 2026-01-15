
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import type { MonthPlan, YM, TaskNode, MilestoneNode, MilestoneStatus } from "../app/types";
import {
  loadState,
  saveState,
  getMonth,
  upsertMonth,
  makeId,
  closeMonth,
  reopenMonth,
  isMonthInGrandPlanPeriod,
  addTaskWithMilestone,
  getMilestonesInMonth,
  deleteTaskFromMonth,
  updateTaskInMonth,
  updateMilestone,
} from "../app/storage";
import { useDateNavigation } from "../contexts/DateNavigationContext";
import FocusTemplateEditor from "../components/FocusTemplateEditor";

function seedPlan(ym: YM): MonthPlan {
  return {
    ym,
    tasks: [],
    templates: [
      { id: makeId("tpl"), title: "Deep Work A", plannedStart: "09:00", plannedEnd: "11:00" },
      { id: makeId("tpl"), title: "Deep Work B", plannedStart: "14:00", plannedEnd: "16:00" },
    ],
    initialSnapshotTaskIds: [],
    createdAt: new Date().toISOString(),
  };
}

// Component for editing tasks under a milestone group
function TaskGroup({
  title,
  color,
  tasks,
  milestoneId,
  milestoneStatus,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onMarkMilestoneCompleted,
  hideAddButton = false,
}: {
  title: string;
  color: string;
  tasks: TaskNode[];
  milestoneId: string | null;
  milestoneStatus?: MilestoneStatus;
  onAddTask: (milestoneId: string | null) => void;
  onUpdateTask: (taskId: string, title: string) => void;
  onDeleteTask: (taskId: string) => void;
  onMarkMilestoneCompleted?: (milestoneId: string) => void;
  hideAddButton?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const startEdit = (task: TaskNode) => {
    setEditingId(task.id);
    setEditTitle(task.title);
  };

  const saveEdit = () => {
    if (editingId && editTitle.trim()) {
      onUpdateTask(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle("");
  };

  const isCompleted = milestoneStatus === "COMPLETED";
  const displayColor = isCompleted ? "#FFD700" : color;
  const bgColor = isCompleted ? "#fffef0" : "white";

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 12,
        backgroundColor: bgColor,
        borderRadius: 8,
        border: `2px solid ${displayColor}`,
        boxShadow: isCompleted ? "0 0 8px rgba(255, 215, 0, 0.4)" : "none",
      }}
    >
      <div
        style={{
          fontWeight: 600,
          marginBottom: 12,
          color: displayColor,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: displayColor,
              display: "inline-block",
            }}
          />
          {title}
          {isCompleted && (
            <span style={{ fontSize: 12, color: "#FFD700" }}>✓ Completed</span>
          )}
        </div>
        {/* Mark as completed button - only show for milestones that aren't completed */}
        {milestoneId && !isCompleted && onMarkMilestoneCompleted && (
          <button
            onClick={() => onMarkMilestoneCompleted(milestoneId)}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: "#FFD700",
              color: "#5d4037",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
            title="Mark this milestone as completed"
          >
            ★ Mark Completed
          </button>
        )}
      </div>

      {tasks.length === 0 ? (
        <p style={{ fontSize: 13, color: "#999", fontStyle: "italic", marginBottom: 8 }}>
          No tasks yet
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tasks.map((task) => (
            <div
              key={task.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                backgroundColor: task.status === "GREEN" ? "#e8f5e9" : task.status === "YELLOW" ? "#fff8e1" : "#fafafa",
                borderRadius: 4,
                border: "1px solid #eee",
              }}
            >
              {/* Read-only status indicator */}
              <span
                style={{
                  width: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  color: task.status === "GREEN" ? "#4caf50" : task.status === "YELLOW" ? "#ff9800" : "#ccc",
                }}
                title={task.status === "GREEN" ? "Completed" : task.status === "YELLOW" ? "In Progress" : "Not started"}
              >
                {task.status === "GREEN" ? "✓" : task.status === "YELLOW" ? "◐" : "○"}
              </span>

              {editingId === task.id ? (
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") {
                      setEditingId(null);
                      setEditTitle("");
                    }
                  }}
                  autoFocus
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    fontSize: 13,
                    border: "1px solid #2196f3",
                    borderRadius: 4,
                    outline: "none",
                  }}
                />
              ) : (
                <span
                  onClick={() => startEdit(task)}
                  style={{
                    flex: 1,
                    fontSize: 13,
                    cursor: "pointer",
                    textDecoration: task.status === "GREEN" ? "line-through" : "none",
                    color: task.status === "GREEN" ? "#666" : "#333",
                  }}
                >
                  {task.title}
                </span>
              )}

              <button
                onClick={() => onDeleteTask(task.id)}
                style={{
                  padding: "2px 6px",
                  fontSize: 11,
                  backgroundColor: "transparent",
                  color: "#f44336",
                  border: "none",
                  cursor: "pointer",
                  opacity: 0.7,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {!hideAddButton && (
        <button
          onClick={() => onAddTask(milestoneId)}
          style={{
            marginTop: 8,
            padding: "6px 10px",
            fontSize: 12,
            backgroundColor: color,
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            opacity: 0.9,
          }}
        >
          + Add Task
        </button>
      )}
    </div>
  );
}

export default function MonthSetupPage() {
  const { selectedMonth } = useDateNavigation();
  const ymSafe = selectedMonth;

  const [tick, setTick] = useState(0);
  const state = useMemo(() => loadState(), [tick]);
  const plan = getMonth(state, ymSafe);

  // v6: Grand Plan is mandatory - redirect if not exists
  if (!state.grandPlan) {
    return <Navigate to="/grand-plan" replace />;
  }

  // v6: Check if month is within Grand Plan period
  const isInPeriod = isMonthInGrandPlanPeriod(state, ymSafe);

  // v2: Undo history (last 10 operations)
  const [history, setHistory] = useState<MonthPlan[]>([]);

  // v5: Close month modal
  const [showCloseModal, setShowCloseModal] = useState(false);

  // v6.1: Milestone picker modal
  const [showMilestonePicker, setShowMilestonePicker] = useState(false);

  const mutate = (fn: (s: typeof state) => typeof state) => {
    if (plan) {
      setHistory((h) => [...h, plan].slice(-10));
    }
    const next = fn(state);
    saveState(next);
    setTick((x) => x + 1);
  };

  const create = () => {
    const next = upsertMonth(state, seedPlan(ymSafe));
    saveState(next);
    setTick((x) => x + 1);
  };

  const handlePlanUpdate = (updatedPlan: MonthPlan) => {
    if (plan) {
      setHistory((h) => [...h, plan].slice(-10));
    }
    saveState(upsertMonth(state, updatedPlan));
    setTick((x) => x + 1);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previousPlan = history[history.length - 1];
    saveState(upsertMonth(state, previousPlan));
    setHistory((h) => h.slice(0, -1));
    setTick((x) => x + 1);
  };

  const resetSnapshot = () => {
    if (!plan) return;
    const message = `This will update your baseline to include all ${plan.tasks.length} current tasks. Metrics will reset. Continue?`;
    if (!confirm(message)) return;
    const next: MonthPlan = { ...plan, initialSnapshotTaskIds: plan.tasks.map((t) => t.id) };
    setHistory((h) => [...h, plan].slice(-10));
    saveState(upsertMonth(state, next));
    setTick((x) => x + 1);
  };

  // v5: Close/reopen month handlers
  const handleCloseMonth = () => {
    const next = closeMonth(state, ymSafe);
    saveState(next);
    setTick((x) => x + 1);
    setShowCloseModal(false);
  };

  const handleReopenMonth = () => {
    const next = reopenMonth(state, ymSafe);
    saveState(next);
    setTick((x) => x + 1);
  };

  // v6.1: Task handlers
  const handleAddTask = (milestoneId: string | null) => {
    const title = prompt("New task:");
    if (!title?.trim()) return;

    if (milestoneId) {
      mutate((s) => addTaskWithMilestone(s, ymSafe, title.trim(), milestoneId).state);
    } else {
      // Add standalone task
      if (!plan) return;
      const task: TaskNode = {
        id: makeId("task"),
        title: title.trim(),
        parentId: null,
        status: "NONE",
      };
      const nextPlan: MonthPlan = { ...plan, tasks: [...plan.tasks, task] };
      handlePlanUpdate(nextPlan);
    }
  };

  const handleUpdateTask = (taskId: string, title: string) => {
    mutate((s) => updateTaskInMonth(s, ymSafe, taskId, { title }));
  };

  const handleDeleteTask = (taskId: string) => {
    mutate((s) => deleteTaskFromMonth(s, ymSafe, taskId));
  };

  // v6.1: Get milestones currently linked (have tasks)
  const linkedMilestones = getMilestonesInMonth(state, ymSafe);

  // v6.1: Get standalone tasks (no linkedMilestoneId)
  const standaloneTasks = plan?.tasks.filter((t) => !t.linkedMilestoneId) ?? [];

  // v6.1: Get tasks for a specific milestone
  const getTasksForMilestone = (milestoneId: string) => {
    return plan?.tasks.filter((t) => t.linkedMilestoneId === milestoneId) ?? [];
  };

  // v6.1: Add milestone to work on this month (by creating a placeholder task)
  const handleLinkMilestone = (milestone: MilestoneNode) => {
    // Add a placeholder task for this milestone
    mutate((s) => addTaskWithMilestone(s, ymSafe, `Work on: ${milestone.title}`, milestone.id).state);
    setShowMilestonePicker(false);
  };

  // v6.1: Mark milestone as completed
  const handleMarkMilestoneCompleted = (milestoneId: string) => {
    mutate((s) => updateMilestone(s, milestoneId, { status: "COMPLETED" }));
  };

  // v5: If month is closed, show read-only report view
  if (plan?.isClosed) {
    // Calculate all metrics
    const snapshotSet = new Set(plan.initialSnapshotTaskIds);
    const snapshotCount = plan.initialSnapshotTaskIds.length;
    const currentCount = plan.tasks.length;
    const addedCount = Math.max(0, currentCount - snapshotCount);

    const snapshotGreen = plan.tasks.filter((t) => snapshotSet.has(t.id) && t.status === "GREEN").length;
    const addedGreen = plan.tasks.filter((t) => !snapshotSet.has(t.id) && t.status === "GREEN").length;

    const sessions = state.sessions.filter((s) => s.ym === ymSafe && s.endedAt && typeof s.actualMinutes === "number");

    const byTemplate = plan.templates.map((tpl) => {
      const list = sessions.filter((s) => s.templateId === tpl.id);
      const totalMinutes = list.reduce((a, b) => a + (b.actualMinutes ?? 0), 0);
      return { tpl, count: list.length, totalMinutes };
    });

    const totalSessions = sessions.length;
    const totalMinutes = sessions.reduce((a, b) => a + (b.actualMinutes ?? 0), 0);

    const completionRate = snapshotCount > 0 ? Math.round((snapshotGreen / snapshotCount) * 100) : 0;
    const totalGreen = plan.tasks.filter((t) => t.status === "GREEN").length;
    const avgSessionDuration = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

    const daysWithSessions = new Set(
      state.sessions
        .filter((s) => s.ym === ymSafe && s.endedAt)
        .map((s) => s.date)
    ).size;

    const daysWithCompletedPrimary = Object.values(state.days).filter(
      (d) => d.ym === ymSafe && d.primaryTaskId && d.outcomeByTaskId[d.primaryTaskId] === "COMPLETED"
    ).length;

    const maxMinutes = Math.max(...byTemplate.map((x) => x.totalMinutes), 1);
    const createBar = (minutes: number) => {
      const percentage = Math.round((minutes / maxMinutes) * 100);
      const filled = Math.round(percentage / 10);
      const empty = 10 - filled;
      return "█".repeat(filled) + "░".repeat(empty);
    };

    // Return closed view
    return (
      <div style={{
        minHeight: "100vh",
        backgroundColor: "#fef9e7",
        padding: "32px 24px",
        fontFamily: "Georgia, serif"
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", marginBottom: 8, fontSize: 28, color: "#5d4037" }}>
            Monthly Report
          </h2>
          <p style={{ textAlign: "center", marginBottom: 32, opacity: 0.7, fontSize: 16 }}>
            {ymSafe}
          </p>

          {/* Task Completion Section */}
          <div style={{
            border: "2px solid #4caf50",
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
            backgroundColor: "#f1f8f4",
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#2e7d32" }}>Task Completion</h3>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #c8e6c9",
              }}>
                <div style={{ fontSize: 14, marginBottom: 4, color: "#666" }}>Completion Rate</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#2e7d32" }}>
                  {completionRate}%
                </div>
                <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                  {snapshotGreen} / {snapshotCount} tasks
                </div>
              </div>

              <div style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #c8e6c9",
              }}>
                <div style={{ fontSize: 14, marginBottom: 4, color: "#666" }}>Total Completed Tasks</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#2e7d32" }}>
                  {totalGreen}
                </div>
                <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                  Snapshot: {snapshotGreen} + Added: {addedGreen}
                </div>
              </div>

              <div style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #c8e6c9",
              }}>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>Breakdown</div>
                <div style={{ fontSize: 13, color: "#555" }}>
                  Snapshot GREEN: <strong>{snapshotGreen}</strong> / {snapshotCount}
                </div>
                <div style={{ fontSize: 13, color: "#555" }}>
                  Added GREEN: <strong>{addedGreen}</strong> / {addedCount}
                </div>
              </div>
            </div>
          </div>

          {/* Focus Sessions Summary */}
          <div style={{
            border: "2px solid #ff9800",
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
            backgroundColor: "#fff8e1",
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#e65100" }}>Focus Sessions</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <div style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #ffe0b2",
              }}>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Total Sessions</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#e65100" }}>{totalSessions}</div>
              </div>

              <div style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #ffe0b2",
              }}>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Total Minutes</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#e65100" }}>{totalMinutes}</div>
              </div>

              <div style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #ffe0b2",
              }}>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Avg Duration</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#e65100" }}>{avgSessionDuration}</div>
                <div style={{ fontSize: 12, color: "#666" }}>min/session</div>
              </div>
            </div>
          </div>

          {/* Focus Distribution */}
          <div style={{
            border: "2px solid #2196f3",
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
            backgroundColor: "#e3f2fd",
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#1565c0" }}>Focus Distribution</h3>
            {byTemplate.length === 0 ? (
              <p style={{
                opacity: 0.6,
                fontStyle: "italic",
                textAlign: "center",
                padding: "24px",
                backgroundColor: "white",
                borderRadius: 8,
              }}>
                No sessions logged yet
              </p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {byTemplate.map(({ tpl, count, totalMinutes: mins }) => {
                  const percentage = maxMinutes > 0 ? Math.round((mins / maxMinutes) * 100) : 0;
                  return (
                    <div key={tpl.id} style={{
                      backgroundColor: "white",
                      borderRadius: 8,
                      padding: 12,
                      border: "1px solid #bbdefb",
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 8, color: "#1565c0" }}>{tpl.title}</div>
                      <div style={{ fontFamily: "monospace", fontSize: 14, marginBottom: 4 }}>
                        {createBar(mins)} {percentage}%
                      </div>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        {mins} min · {count} sessions
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Consistency Metrics */}
          <div style={{
            border: "2px solid #f44336",
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
            backgroundColor: "#ffebee",
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#c62828" }}>Consistency</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <div style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #ffcdd2",
              }}>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Days with Focus</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#c62828" }}>{daysWithSessions}</div>
                <div style={{ fontSize: 12, color: "#666" }}>days with sessions</div>
              </div>

              <div style={{
                padding: "12px",
                backgroundColor: "white",
                borderRadius: 8,
                border: "1px solid #ffcdd2",
              }}>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Primary Completed</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#c62828" }}>{daysWithCompletedPrimary}</div>
                <div style={{ fontSize: 12, color: "#666" }}>days completed</div>
              </div>
            </div>
          </div>

          {/* Reopen Button */}
          <div style={{ textAlign: "center", marginTop: 48, paddingTop: 24, borderTop: "2px solid #d7ccc8" }}>
            <button
              onClick={handleReopenMonth}
              style={{
                padding: "12px 32px",
                fontSize: 16,
                fontWeight: 600,
                backgroundColor: "#4caf50",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Reopen Month for Editing
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2>Month Setup: {ymSafe}</h2>
      <p style={{ marginTop: -8, marginBottom: 24, opacity: 0.7 }}>
        Configure your monthly tasks and focus templates
      </p>

      {!plan ? (
        <div
          style={{
            padding: 32,
            border: "2px dashed #ddd",
            borderRadius: 12,
            textAlign: "center",
            backgroundColor: "#fafafa",
          }}
        >
          {!isInPeriod ? (
            <>
              <p style={{ fontSize: 18, marginBottom: 16, color: "#f44336" }}>Month Outside Grand Plan Period</p>
              <p style={{ color: "#666", marginBottom: 16 }}>
                This month ({ymSafe}) is outside your Grand Plan period
                ({state.grandPlan.startMonth} - {state.grandPlan.endMonth ?? "Ongoing"}).
              </p>
              <p style={{ fontSize: 13, color: "#666" }}>
                Adjust your Grand Plan dates or navigate to a month within the plan period.
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 18, marginBottom: 16 }}>No plan for {ymSafe} yet</p>
              <p style={{ color: "#666", marginBottom: 24 }}>
                Create a monthly plan to start tracking tasks and focus sessions.
              </p>
              <button
                onClick={create}
                style={{
                  padding: "12px 24px",
                  fontSize: 16,
                  fontWeight: 600,
                  backgroundColor: "#2196f3",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                }}
              >
                Create Month Plan
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Stats & Controls */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 16,
              marginBottom: 24,
            }}
          >
            {/* Stats */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 14, color: "#666" }}>
                Snapshot: <strong>{plan.initialSnapshotTaskIds.length}</strong>
              </span>
              <span style={{ color: "#ddd" }}>|</span>
              <span style={{ fontSize: 14, color: "#666" }}>
                Current: <strong>{plan.tasks.length}</strong>
              </span>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={handleUndo}
                disabled={history.length === 0}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  backgroundColor: history.length > 0 ? "#ff9800" : "#ddd",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: history.length > 0 ? "pointer" : "not-allowed",
                }}
              >
                Undo ({history.length})
              </button>
              <button
                onClick={resetSnapshot}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  backgroundColor: "#f44336",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Reset Snapshot
              </button>
            </div>
          </div>

          {/* v6.1: Unified Monthly Tasks Section */}
          <div
            style={{
              border: "2px solid #4caf50",
              borderRadius: 12,
              padding: 16,
              marginBottom: 24,
              backgroundColor: "#f1f8f4",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#2e7d32" }}>
              Monthly Tasks
            </h3>

            {/* Tasks grouped by milestone */}
            {linkedMilestones.map((milestone) => {
              const category = state.grandPlan?.categories.find((c) => c.id === milestone.categoryId);
              const tasks = getTasksForMilestone(milestone.id);
              return (
                <TaskGroup
                  key={milestone.id}
                  title={`[${category?.title ?? "Category"}] ${milestone.title}`}
                  color={category?.color ?? "#9c27b0"}
                  tasks={tasks}
                  milestoneId={milestone.id}
                  milestoneStatus={milestone.status}
                  onAddTask={handleAddTask}
                  onUpdateTask={handleUpdateTask}
                  onDeleteTask={handleDeleteTask}
                  onMarkMilestoneCompleted={handleMarkMilestoneCompleted}
                />
              );
            })}

            {/* Standalone tasks - only show box if there are standalone tasks */}
            {standaloneTasks.length > 0 && (
              <TaskGroup
                title="Standalone Tasks"
                color="#607d8b"
                tasks={standaloneTasks}
                milestoneId={null}
                onAddTask={handleAddTask}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
              />
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
              {isInPeriod && state.grandPlan.milestones.length > 0 && (
                <button
                  onClick={() => setShowMilestonePicker(true)}
                  style={{
                    padding: "8px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    backgroundColor: "#9c27b0",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  + Link Milestone
                </button>
              )}
              {standaloneTasks.length === 0 && (
                <button
                  onClick={() => handleAddTask(null)}
                  style={{
                    padding: "8px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    backgroundColor: "#607d8b",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  + Add Standalone Task
                </button>
              )}
            </div>
          </div>

          {/* Focus Templates Section */}
          <div
            style={{
              border: "2px solid #ff9800",
              borderRadius: 12,
              padding: 16,
              marginBottom: 24,
              backgroundColor: "#fff8e1",
            }}
          >
            <FocusTemplateEditor plan={plan} onUpdate={handlePlanUpdate} />
          </div>

          {/* v5: Close Month Button */}
          <div style={{ textAlign: "center", marginTop: 48, paddingTop: 24, borderTop: "2px solid #ddd" }}>
            <button
              onClick={() => setShowCloseModal(true)}
              style={{
                padding: "12px 32px",
                fontSize: 16,
                fontWeight: 600,
                backgroundColor: "#ff9800",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Close Month
            </button>
            <p style={{ marginTop: 8, fontSize: 14, color: "#666" }}>
              Mark this month as complete and view the final report
            </p>
          </div>

          {/* v6.1: Milestone Picker Modal */}
          {showMilestonePicker && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
              onClick={() => setShowMilestonePicker(false)}
            >
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 500,
                  width: "90%",
                  maxHeight: "80vh",
                  overflow: "auto",
                  boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>Select Milestone to Work On</h3>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
                  Choose a milestone from your Grand Plan. A task will be created under it.
                </p>

                {state.grandPlan.categories
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((category) => {
                    const milestones = state.grandPlan!.milestones.filter(
                      (m) => m.categoryId === category.id
                    );
                    if (milestones.length === 0) return null;

                    // Filter out already linked milestones and completed milestones
                    const linkedIds = new Set(linkedMilestones.map((m) => m.id));
                    const available = milestones.filter(
                      (m) => !linkedIds.has(m.id) && m.status !== "COMPLETED"
                    );

                    if (available.length === 0) return null;

                    return (
                      <div key={category.id} style={{ marginBottom: 16 }}>
                        <div
                          style={{
                            fontSize: 12,
                            color: category.color,
                            fontWeight: 600,
                            marginBottom: 8,
                          }}
                        >
                          {category.title}
                        </div>
                        {available.map((milestone) => (
                          <button
                            key={milestone.id}
                            onClick={() => handleLinkMilestone(milestone)}
                            style={{
                              display: "block",
                              width: "100%",
                              padding: "10px 12px",
                              marginBottom: 4,
                              textAlign: "left",
                              backgroundColor: "white",
                              border: `1px solid ${category.color}`,
                              borderRadius: 6,
                              cursor: "pointer",
                              fontSize: 14,
                            }}
                          >
                            {milestone.title}
                            <span
                              style={{
                                float: "right",
                                fontSize: 11,
                                padding: "2px 6px",
                                borderRadius: 4,
                                backgroundColor:
                                  milestone.status === "COMPLETED"
                                    ? "#4caf50"
                                    : milestone.status === "IN_PROGRESS"
                                    ? "#ff9800"
                                    : "#9e9e9e",
                                color: "white",
                              }}
                            >
                              {milestone.status.replace("_", " ")}
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })}

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                  <button
                    onClick={() => setShowMilestonePicker(false)}
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
                </div>
              </div>
            </div>
          )}

          {/* v5: Close Month Confirmation Modal */}
          {showCloseModal && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
              onClick={() => setShowCloseModal(false)}
            >
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 500,
                  width: "90%",
                  boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>Close Month</h3>
                <p style={{ marginBottom: 24, lineHeight: 1.6 }}>
                  This will close the month and convert it to a read-only report view.
                  You can reopen the month later if needed.
                </p>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setShowCloseModal(false)}
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
                    onClick={handleCloseMonth}
                    style={{
                      padding: "8px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      backgroundColor: "#ff9800",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Close Month
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
