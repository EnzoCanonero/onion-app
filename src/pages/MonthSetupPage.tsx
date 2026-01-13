
import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { MonthPlan, YM } from "../app/types";
import { loadState, saveState, getMonth, upsertMonth, makeId } from "../app/storage";
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
  const { ym } = useParams();
  const ymSafe = (ym ?? "") as YM;

  const [tick, setTick] = useState(0);
  const state = useMemo(() => loadState(), [tick]);
  const plan = getMonth(state, ymSafe);

  // v2: Undo history (last 10 operations)
  const [history, setHistory] = useState<MonthPlan[]>([]);

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
        </>
      )}
    </div>
  );
}
