import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { YM } from "../app/types";
import { loadState, getMonth } from "../app/storage";

export default function MonthlyReportPage() {
  const { ym } = useParams();
  const ymSafe = (ym ?? "") as YM;

  const [tick] = useState(0);
  const state = useMemo(() => loadState(), [tick]);
  const plan = getMonth(state, ymSafe);

  if (!plan) {
    return (
      <div>
        <h2>📈 Monthly Report: {ymSafe}</h2>
        <p style={{ marginTop: -8, marginBottom: 24, opacity: 0.7 }}>
          Track your progress and productivity metrics
        </p>

        <div
          style={{
            textAlign: "center",
            padding: 48,
            border: "2px dashed #ddd",
            borderRadius: 12,
            backgroundColor: "#f9f9f9",
          }}
        >
          <p style={{ fontSize: 16, marginBottom: 24, opacity: 0.8 }}>
            No monthly plan found for <strong>{ymSafe}</strong>
          </p>
          <Link
            to={`/month/${ymSafe}/setup`}
            style={{
              padding: "12px 24px",
              fontSize: 16,
              fontWeight: 600,
              backgroundColor: "#2196f3",
              color: "white",
              border: "none",
              borderRadius: 8,
              textDecoration: "none",
              display: "inline-block",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
            }}
          >
            ⚙️ Go to Month Setup
          </Link>
        </div>
      </div>
    );
  }

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

  // v2: Enhanced metrics
  const completionRate = snapshotCount > 0 ? Math.round((snapshotGreen / snapshotCount) * 100) : 0;
  const totalGreen = plan.tasks.filter((t) => t.status === "GREEN").length;
  const avgSessionDuration = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

  // v2: Streaks
  const daysWithSessions = new Set(
    state.sessions
      .filter((s) => s.ym === ymSafe && s.endedAt)
      .map((s) => s.date)
  ).size;

  const daysWithCompletedPrimary = Object.values(state.days).filter(
    (d) => d.ym === ymSafe && d.primaryTaskId && d.outcomeByTaskId[d.primaryTaskId] === "COMPLETED"
  ).length;

  // v2: Focus distribution visualization
  const maxMinutes = Math.max(...byTemplate.map((x) => x.totalMinutes), 1);
  const createBar = (minutes: number) => {
    const percentage = Math.round((minutes / maxMinutes) * 100);
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return "█".repeat(filled) + "░".repeat(empty);
  };

  return (
    <div>
      <h2>📈 Monthly Report: {ymSafe}</h2>
      <p style={{ marginTop: -8, marginBottom: 24, opacity: 0.7 }}>
        Track your progress and productivity metrics
      </p>

      {/* Task Completion Section */}
      <div
        style={{
          border: "2px solid #4caf50",
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          backgroundColor: "#f1f8f4",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 16, color: "#2e7d32" }}>📊 Task Completion</h3>
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              padding: "12px",
              backgroundColor: "white",
              borderRadius: 8,
              border: "1px solid #c8e6c9",
            }}
          >
            <div style={{ fontSize: 14, marginBottom: 4, color: "#666" }}>Completion Rate</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#2e7d32" }}>
              {completionRate}%
            </div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
              {snapshotGreen} / {snapshotCount} tasks
            </div>
          </div>

          <div
            style={{
              padding: "12px",
              backgroundColor: "white",
              borderRadius: 8,
              border: "1px solid #c8e6c9",
            }}
          >
            <div style={{ fontSize: 14, marginBottom: 4, color: "#666" }}>Total Completed Tasks</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#2e7d32" }}>
              {totalGreen}
            </div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
              Snapshot: {snapshotGreen} + Added: {addedGreen}
            </div>
          </div>

          <div
            style={{
              padding: "12px",
              backgroundColor: "white",
              borderRadius: 8,
              border: "1px solid #c8e6c9",
            }}
          >
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
      <div
        style={{
          border: "2px solid #ff9800",
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          backgroundColor: "#fff8e1",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 16, color: "#e65100" }}>⏱️ Focus Sessions</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <div
            style={{
              padding: "12px",
              backgroundColor: "white",
              borderRadius: 8,
              border: "1px solid #ffe0b2",
            }}
          >
            <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Total Sessions</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#e65100" }}>{totalSessions}</div>
          </div>

          <div
            style={{
              padding: "12px",
              backgroundColor: "white",
              borderRadius: 8,
              border: "1px solid #ffe0b2",
            }}
          >
            <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Total Minutes</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#e65100" }}>{totalMinutes}</div>
          </div>

          <div
            style={{
              padding: "12px",
              backgroundColor: "white",
              borderRadius: 8,
              border: "1px solid #ffe0b2",
            }}
          >
            <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Avg Duration</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#e65100" }}>{avgSessionDuration}</div>
            <div style={{ fontSize: 12, color: "#666" }}>min/session</div>
          </div>
        </div>
      </div>

      {/* Focus Distribution */}
      <div
        style={{
          border: "2px solid #2196f3",
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          backgroundColor: "#e3f2fd",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 16, color: "#1565c0" }}>📈 Focus Distribution</h3>
        {byTemplate.length === 0 ? (
          <p
            style={{
              opacity: 0.6,
              fontStyle: "italic",
              textAlign: "center",
              padding: "24px",
              backgroundColor: "white",
              borderRadius: 8,
            }}
          >
            No sessions logged yet
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {byTemplate.map(({ tpl, count, totalMinutes }) => {
              const percentage = maxMinutes > 0 ? Math.round((totalMinutes / maxMinutes) * 100) : 0;
              return (
                <div
                  key={tpl.id}
                  style={{
                    backgroundColor: "white",
                    borderRadius: 8,
                    padding: 12,
                    border: "1px solid #bbdefb",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 8, color: "#1565c0" }}>{tpl.title}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 14, marginBottom: 4 }}>
                    {createBar(totalMinutes)} {percentage}%
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {totalMinutes} min · {count} sessions
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Consistency Metrics */}
      <div
        style={{
          border: "2px solid #f44336",
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          backgroundColor: "#ffebee",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 16, color: "#c62828" }}>🔥 Consistency</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <div
            style={{
              padding: "12px",
              backgroundColor: "white",
              borderRadius: 8,
              border: "1px solid #ffcdd2",
            }}
          >
            <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Days with Focus</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#c62828" }}>{daysWithSessions}</div>
            <div style={{ fontSize: 12, color: "#666" }}>days with sessions</div>
          </div>

          <div
            style={{
              padding: "12px",
              backgroundColor: "white",
              borderRadius: 8,
              border: "1px solid #ffcdd2",
            }}
          >
            <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Primary Completed</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#c62828" }}>{daysWithCompletedPrimary}</div>
            <div style={{ fontSize: 12, color: "#666" }}>days completed</div>
          </div>
        </div>
      </div>

      <p style={{ opacity: 0.6, fontSize: 13, textAlign: "center", marginTop: 16 }}>
        💡 v2: Enhanced metrics with completion rate, throughput, focus distribution, and consistency tracking
      </p>
    </div>
  );
}
