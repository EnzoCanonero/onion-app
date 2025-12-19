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
        <h2>Monthly Report: {ymSafe}</h2>
        <p>No MonthPlan found. Create it first.</p>
        <Link to={`/month/${ymSafe}/setup`}>Go to Month Setup</Link>
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

  return (
    <div>
      <h2>Monthly Report: {ymSafe}</h2>
      <p>
        <Link to={`/month/${ymSafe}/setup`}>Month Setup</Link>
      </p>

      <h3>Tree completion (v1)</h3>
      <ul>
        <li>
          Snapshot GREEN: <b>{snapshotGreen}</b> / {snapshotCount}
        </li>
        <li>
          Added GREEN: <b>{addedGreen}</b> / {addedCount}
        </li>
      </ul>

      <h3>Focus adherence (v0)</h3>
      <ul>
        <li>
          Total ended sessions: <b>{totalSessions}</b>
        </li>
        <li>
          Total minutes: <b>{totalMinutes}</b>
        </li>
      </ul>

      <h4>By template</h4>
      <ul>
        {byTemplate.map(({ tpl, count, totalMinutes }) => (
          <li key={tpl.id}>
            {tpl.title}: {count} sessions, {totalMinutes} minutes
          </li>
        ))}
      </ul>

      <p style={{ opacity: 0.8 }}>v1 note: GREEN statuses are sticky once achieved in the month.</p>
    </div>
  );
}
