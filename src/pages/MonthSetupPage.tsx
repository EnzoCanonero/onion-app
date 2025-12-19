
import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { MonthPlan, YM } from "../app/types";
import { loadState, saveState, getMonth, upsertMonth, makeId } from "../app/storage";

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

  const create = () => {
    const next = upsertMonth(state, seedPlan(ymSafe));
    saveState(next);
    setTick((x) => x + 1);
  };

  const resetSnapshot = () => {
    if (!plan) return;
    const next: MonthPlan = { ...plan, initialSnapshotTaskIds: plan.tasks.map((t) => t.id) };
    saveState(upsertMonth(state, next));
    setTick((x) => x + 1);
  };

  return (
    <div>
      <h2>Month Setup: {ymSafe}</h2>

      {!plan ? (
        <>
          <p>No MonthPlan found locally for this month.</p>
          <button onClick={create}>Create dummy month plan</button>
        </>
      ) : (
        <>
          <p>
            MonthPlan exists. Tasks: <b>{plan.tasks.length}</b>, Templates: <b>{plan.templates.length}</b>
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={resetSnapshot}>Reset snapshot to current tasks</button>
            <Link to={`/day/${ymSafe}-01`}>Open a day in this month</Link>
            <Link to={`/month/${ymSafe}/report`}>Open report</Link>
          </div>

          <h3 style={{ marginTop: 16 }}>Tasks (dummy)</h3>
          <ul>
            {plan.tasks.map((t) => (
              <li key={t.id}>
                {t.title} — <code>{t.status}</code>
              </li>
            ))}
          </ul>

          <h3>Focus templates (dummy)</h3>
          <ul>
            {plan.templates.map((t) => (
              <li key={t.id}>
                {t.title}: {t.plannedStart}–{t.plannedEnd}
              </li>
            ))}
          </ul>

          <p style={{ opacity: 0.8 }}>
            v0 note: no editor yet; this page only proves month-scoped storage works.
          </p>
        </>
      )}
    </div>
  );
}
