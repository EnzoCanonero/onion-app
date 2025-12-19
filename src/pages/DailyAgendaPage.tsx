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
  addTaskToMonth,
  setDayTasks,
  setTaskOutcome,
  setShutdownNote,
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

  const tasksById = useMemo(() => new Map(plan.tasks.map((t) => [t.id, t] as const)), [plan.tasks]);

  const assignedTaskIds = Array.from(
    new Set([day.primaryTaskId, ...day.secondaryTaskIds].filter(Boolean) as string[])
  );

  const assignedTasks = assignedTaskIds
    .map((id) => tasksById.get(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  const setPrimaryTask = (taskId: string) => {
    mutate((s0) => {
      const { state: withDay0, day: day0 } = getOrCreateDay(s0, dateSafe, ym);
      return setDayTasks(withDay0, dateSafe, taskId, day0.secondaryTaskIds);
    });
  };

  const setSecondaryTasks = (taskIds: string[]) => {
    mutate((s0) => {
      const { state: withDay0, day: day0 } = getOrCreateDay(s0, dateSafe, ym);
      return setDayTasks(withDay0, dateSafe, day0.primaryTaskId, taskIds);
    });
  };

  const setOutcome = (taskId: string, outcome: "COMPLETED" | "NOT_COMPLETED" | undefined) => {
    mutate((s0) => setTaskOutcome(s0, dateSafe, taskId, outcome));
  };

  const normalizeShutdownNote = (
    note: unknown
  ): {
    comment: string;
    pending: string;
  } => {
    if (!note || typeof note !== "object") return { comment: "", pending: "" };
    const rec = note as Record<string, unknown>;
    const pending = typeof rec.pending === "string" ? rec.pending : "";

    if (typeof rec.comment === "string") return { comment: rec.comment, pending };

    const done = typeof rec.done === "string" ? rec.done : "";
    const nextStep = typeof rec.nextStep === "string" ? rec.nextStep : "";
    const comment = [done, nextStep].filter((s) => s && s.trim()).join("\n\n");
    return { comment, pending };
  };

  const updateShutdown = (patch: Partial<{ comment: string; pending: string }>) => {
    mutate((s0) => {
      const { state: withDay0, day: day0 } = getOrCreateDay(s0, dateSafe, ym);
      const current = normalizeShutdownNote(day0.shutdownNote);
      return setShutdownNote(withDay0, dateSafe, { ...current, ...patch });
    });
  };

  const clearShutdown = () => mutate((s0) => setShutdownNote(s0, dateSafe, undefined));

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskParentId, setNewTaskParentId] = useState<string>(""); // "" => top-level

  const addNewTask = () => {
    const title = newTaskTitle.trim();
    if (!title) return;

    mutate((s0) => {
      const res = addTaskToMonth(s0, ym, title, newTaskParentId ? newTaskParentId : null);
      return res.state;
    });

    setNewTaskTitle("");
    setNewTaskParentId("");
  };

  return (
    <div>
      <h2>Daily Agenda: {dateSafe}</h2>
      <p>
        Active month: <b>{ym}</b> — <Link to={`/month/${ym}/setup`}>Month Setup</Link> —{" "}
        <Link to={`/month/${ym}/report`}>Report</Link>
      </p>

      <h3>Daily tasks (v1)</h3>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <div>Primary task</div>
          <select value={day.primaryTaskId ?? ""} onChange={(e) => setPrimaryTask(e.target.value)}>
            <option value="" disabled>
              Select a primary task…
            </option>
            {plan.tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div>Secondary tasks</div>
          <select
            multiple
            size={Math.min(10, Math.max(4, plan.tasks.length))}
            value={day.secondaryTaskIds}
            onChange={(e) => {
              const selected = Array.from(e.currentTarget.selectedOptions).map((o) => o.value);
              setSecondaryTasks(selected);
            }}
          >
            {plan.tasks.map((t) => (
              <option key={t.id} value={t.id} disabled={t.id === day.primaryTaskId}>
                {t.title}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Tip: hold ⌘/Ctrl to multi-select.</div>
        </label>

        <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Add new task</div>
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div>Title</div>
              <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div>Parent (optional)</div>
              <select value={newTaskParentId} onChange={(e) => setNewTaskParentId(e.target.value)}>
                <option value="">Top-level</option>
                {plan.tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={addNewTask} disabled={!newTaskTitle.trim()}>
                Add
              </button>
              <div style={{ fontSize: 12, opacity: 0.8 }}>New tasks start with status NONE and do not change the snapshot.</div>
            </div>
          </div>
        </div>
      </div>

      <h3 style={{ marginTop: 16 }}>Task outcomes (v1)</h3>
      {assignedTasks.length === 0 ? (
        <p style={{ opacity: 0.8 }}>Assign a primary task (and optionally secondary tasks) to record outcomes.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {assignedTasks.map((t) => {
            const outcome = day.outcomeByTaskId[t.id];
            return (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  justifyContent: "space-between",
                  border: "1px solid #eee",
                  padding: 10,
                  borderRadius: 8,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <div>
                    {t.title}{" "}
                    <span style={{ fontSize: 12, opacity: 0.7 }}>
                      (<code>{t.status}</code>)
                    </span>
                  </div>
                  {outcome ? (
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      Today: <b>{outcome}</b>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, opacity: 0.6 }}>Today: not set</div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setOutcome(t.id, "COMPLETED")}
                    disabled={outcome === "COMPLETED"}
                    title="Marks the month task GREEN (sticky)"
                  >
                    COMPLETED
                  </button>
                  <button
                    onClick={() => setOutcome(t.id, "NOT_COMPLETED")}
                    disabled={outcome === "NOT_COMPLETED"}
                    title="Marks the month task YELLOW (unless already GREEN)"
                  >
                    NOT_COMPLETED
                  </button>
                  <button onClick={() => setOutcome(t.id, undefined)} disabled={!outcome}>
                    Clear
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h3 style={{ marginTop: 16 }}>Shutdown note (v1)</h3>
      <div style={{ display: "grid", gap: 10 }}>
        <textarea
          rows={4}
          placeholder="Comment…"
          value={normalizeShutdownNote(day.shutdownNote).comment}
          onChange={(e) => updateShutdown({ comment: e.target.value })}
        />
        <label style={{ display: "grid", gap: 6 }}>
          <div>Pending</div>
          <textarea
            rows={3}
            value={normalizeShutdownNote(day.shutdownNote).pending}
            onChange={(e) => updateShutdown({ pending: e.target.value })}
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={clearShutdown} disabled={!day.shutdownNote}>
            Clear note
          </button>
        </div>
      </div>

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
        v1 note: task outcomes apply sticky month statuses (GREEN never downgrades; MVP keeps YELLOW too).
      </p>
    </div>
  );
}
