
import { useMemo, useState } from "react";
import type { MonthPlan, YM } from "../app/types";
import { loadState, saveState, getMonth, upsertMonth, makeId, closeMonth, reopenMonth } from "../app/storage";
import { useDateNavigation } from "../contexts/DateNavigationContext";
import TaskTreeEditor from "../components/TaskTreeEditor";
import FocusTemplateEditor from "../components/FocusTemplateEditor";
import EmptyMonthPanel from "../components/EmptyMonthPanel";

function seedPlan(ym: YM): MonthPlan {
  const t1 = { id: makeId("task"), title: "Main: Write monthly plan", parentId: null, status: "NONE" as const };
  const t2 = { id: makeId("task"), title: "Secondary: Clean up notes", parentId: null, status: "NONE" as const };
  const tplA = { id: makeId("tpl"), title: "Deep Work A", plannedStart: "09:00", plannedEnd: "11:00" };
  const tplB = { id: makeId("tpl"), title: "Deep Work B", plannedStart: "14:00", plannedEnd: "16:00" };

  return {
    ym,
    tasks: [t1, t2],
    templates: [tplA, tplB],
    initialSnapshotTaskIds: [t1.id, t2.id],
    createdAt: new Date().toISOString(),
  };
}

export default function MonthSetupPage() {
  const { selectedMonth } = useDateNavigation();  // From context
  const ymSafe = selectedMonth;

  const [tick, setTick] = useState(0);
  const state = useMemo(() => loadState(), [tick]);
  const plan = getMonth(state, ymSafe);

  // v2: Undo history (last 10 operations)
  const [history, setHistory] = useState<MonthPlan[]>([]);

  // v5: Close month modal
  const [showCloseModal, setShowCloseModal] = useState(false);

  const create = () => {
    const next = upsertMonth(state, seedPlan(ymSafe));
    saveState(next);
    setTick((x) => x + 1);
  };

  const handlePlanUpdate = (updatedPlan: MonthPlan) => {
    // Push current plan to history before updating
    if (plan) {
      setHistory((h) => [...h, plan].slice(-10)); // Keep last 10
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

    // Push to history before resetting
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

  // v5: If month is closed, show read-only report view
  if (plan?.isClosed) {
    // Calculate all metrics (from MonthlyReportPage)
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

    // Return closed view (journal style from DailyAgendaPage + metrics from MonthlyReportPage)
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
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#2e7d32" }}>📊 Task Completion</h3>
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
                  • Snapshot GREEN: <strong>{snapshotGreen}</strong> / {snapshotCount}
                </div>
                <div style={{ fontSize: 13, color: "#555" }}>
                  • Added GREEN: <strong>{addedGreen}</strong> / {addedCount}
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
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#e65100" }}>⏱️ Focus Sessions</h3>
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
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#1565c0" }}>📈 Focus Distribution</h3>
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
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#c62828" }}>🔥 Consistency</h3>
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
              🔓 Reopen Month for Editing
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2>📋 Month Setup: {ymSafe}</h2>
      <p style={{ marginTop: -8, marginBottom: 24, opacity: 0.7 }}>
        Configure your monthly tasks and focus templates
      </p>

      {!plan ? (
        <>
          <EmptyMonthPanel ym={ymSafe} showCreateButton={false} />
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
              display: "block",
              margin: "0 auto",
            }}
          >
            ✨ Create Month Plan
          </button>
        </>
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
                📊 Snapshot: <strong>{plan.initialSnapshotTaskIds.length}</strong>
              </span>
              <span style={{ color: "#ddd" }}>•</span>
              <span style={{ fontSize: 14, color: "#666" }}>
                📝 Current: <strong>{plan.tasks.length}</strong>
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
                ↶ Undo ({history.length})
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
                🔄 Reset Snapshot
              </button>
            </div>
          </div>

          {/* Task Tree Editor Section */}
          <div
            style={{
              border: "2px solid #4caf50",
              borderRadius: 12,
              padding: 16,
              marginBottom: 24,
              backgroundColor: "#f1f8f4",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#2e7d32" }}>🌳 Monthly Tasks</h3>
            <TaskTreeEditor plan={plan} onUpdate={handlePlanUpdate} />
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

          <p style={{ opacity: 0.6, fontSize: 13, textAlign: "center", marginTop: 16 }}>
            💡 v2: Full tree editor with CRUD, undo, and collapse/expand. Focus template editing enabled.
          </p>

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
              🔒 Close Month
            </button>
            <p style={{ marginTop: 8, fontSize: 14, color: "#666" }}>
              Mark this month as complete and view the final report
            </p>
          </div>

          {/* v5: Confirmation Modal */}
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
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>⚠️ Close Month</h3>
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
                    ✓ Close Month
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
