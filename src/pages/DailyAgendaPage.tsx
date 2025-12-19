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
} from "../app/storage";

export default function DailyAgendaPage() {
  const { date } = useParams();
  const dateSafe = (date ?? "") as DateISO;
  const ym = ymFromDate(dateSafe);

  const nav = useNavigate();
  const [tick, setTick] = useState(0);
  const state = useMemo(() => loadState(), [tick]);

  const plan = getMonth(state, ym);

  // Active month rule (v0): redirect if no plan exists
  if (!plan) {
    return (
      <div>
        <h2>Daily Agenda: {dateSafe}</h2>
        <p>No MonthPlan for <b>{ym}</b>. You need to create it first.</p>
        <button onClick={() => nav(`/month/${ym}/setup`)}>Go to Month Setup</button>
      </div>
    );
  }

  const { state: withDay, day } = getOrCreateDay(state, dateSafe, ym);

  // Persist newly created day entry (only once)
  if (withDay !== state) {
    saveState(withDay);
  }

  const activeSession = day.activeSessionId
    ? withDay.sessions.find((s) => s.id === day.activeSessionId)
    : undefined;

  const startSession = (templateId: string) => {
    if (day.activeSessionId) return;

    const sessionId = makeId("sess");
    const s = {
      id: sessionId,
      date: dateSafe,
      ym,
      templateId,
      startedAt: new Date().toISOString(),
    };

    let next = addSession(withDay, s);
    next = updateDay(next, { ...day, activeSessionId: sessionId });
    saveState(next);
    setTick((x) => x + 1);
  };

  const endSession = () => {
    if (!day.activeSessionId || !activeSession?.startedAt) return;

    const endedAt = new Date().toISOString();
    const ms = Date.parse(endedAt) - Date.parse(activeSession.startedAt);
    const minutes = Math.max(0, Math.round(ms / 60000));

    let next = updateSession(withDay, day.activeSessionId, { endedAt, actualMinutes: minutes });
    next = updateDay(next, { ...day, activeSessionId: undefined });
    saveState(next);
    setTick((x) => x + 1);
  };

  return (
    <div>
      <h2>Daily Agenda: {dateSafe}</h2>
      <p>
        Active month: <b>{ym}</b> — <Link to={`/month/${ym}/setup`}>Month Setup</Link> —{" "}
        <Link to={`/month/${ym}/report`}>Report</Link>
      </p>

      <h3>Focus session (v0)</h3>
      {day.activeSessionId ? (
        <>
          <p>
            Running session: <code>{day.activeSessionId}</code>
          </p>
          <button onClick={endSession}>End</button>
        </>
      ) : (
        <>
          <p>No running session.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {plan.templates.map((t) => (
              <button key={t.id} onClick={() => startSession(t.id)}>
                Start {t.title}
              </button>
            ))}
          </div>
        </>
      )}

      <h3 style={{ marginTop: 16 }}>Quick debug</h3>
      <ul>
        <li>Templates available: {plan.templates.length}</li>
        <li>Sessions logged for this day: {withDay.sessions.filter((s) => s.date === dateSafe && s.endedAt).length}</li>
        <li>Total sessions in month so far: {withDay.sessions.filter((s) => s.ym === ym && s.endedAt).length}</li>
      </ul>

      <p style={{ opacity: 0.8 }}>
        v0 note: task selection/outcomes and shutdown note come in the next milestone.
      </p>
    </div>
  );
}

