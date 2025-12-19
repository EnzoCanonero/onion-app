import type {
  AppStateV0,
  DateISO,
  MonthPlan,
  YM,
  DayEntry,
  ProductivitySession,
  TaskNode,
} from "./types";

const KEY = "focustree.state";

const emptyState: AppStateV0 = { version: 0, months: {}, days: {}, sessions: [] };

export function loadState(): AppStateV0 {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState;
    const parsed = JSON.parse(raw) as AppStateV0;
    if (parsed?.version !== 0) return emptyState;
    return parsed;
  } catch {
    return emptyState;
  }
}

export function saveState(state: AppStateV0) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function getMonth(state: AppStateV0, ym: YM): MonthPlan | undefined {
  return state.months[ym];
}

export function upsertMonth(state: AppStateV0, plan: MonthPlan): AppStateV0 {
  return { ...state, months: { ...state.months, [plan.ym]: plan } };
}

export function getOrCreateDay(state: AppStateV0, date: DateISO, ym: YM): { state: AppStateV0; day: DayEntry } {
  const existing = state.days[date];
  if (existing) return { state, day: existing };

  const day: DayEntry = {
    date,
    ym,
    secondaryTaskIds: [],
    outcomeByTaskId: {},
  };
  const next = { ...state, days: { ...state.days, [date]: day } };
  return { state: next, day };
}

export function addSession(state: AppStateV0, s: ProductivitySession): AppStateV0 {
  return { ...state, sessions: [s, ...state.sessions] };
}

export function updateDay(state: AppStateV0, day: DayEntry): AppStateV0 {
  return { ...state, days: { ...state.days, [day.date]: day } };
}

export function updateSession(state: AppStateV0, sessionId: string, patch: Partial<ProductivitySession>): AppStateV0 {
  return {
    ...state,
    sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, ...patch } : s)),
  };
}

export function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function ymFromDate(date: DateISO): YM {
  return date.slice(0, 7) as YM;
}

export function addTaskToMonth(
  state: AppStateV0,
  ym: YM,
  title: string,
  parentId: string | null
): { state: AppStateV0; task: TaskNode } | { state: AppStateV0; task: undefined } {
  const plan = getMonth(state, ym);
  if (!plan) return { state, task: undefined };

  const task: TaskNode = {
    id: makeId("task"),
    title,
    parentId,
    status: "NONE",
  };

  const nextPlan: MonthPlan = { ...plan, tasks: [...plan.tasks, task] };
  return { state: upsertMonth(state, nextPlan), task };
}

export function setDayTasks(
  state: AppStateV0,
  date: DateISO,
  primaryTaskId: string | undefined,
  secondaryTaskIds: string[]
): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);

  const primary = primaryTaskId && primaryTaskId.trim() ? primaryTaskId : undefined;
  const secondary = Array.from(new Set(secondaryTaskIds.filter((id) => id && id !== primary)));

  return updateDay(withDay, { ...day, primaryTaskId: primary, secondaryTaskIds: secondary });
}

export function applyStatusToMonth(
  state: AppStateV0,
  ym: YM,
  taskId: string,
  outcome: "COMPLETED" | "NOT_COMPLETED" | undefined
): AppStateV0 {
  const plan = getMonth(state, ym);
  if (!plan) return state;

  const existing = plan.tasks.find((t) => t.id === taskId);
  if (!existing) return state;

  const nextStatus =
    existing.status === "GREEN"
      ? "GREEN"
      : outcome === "COMPLETED"
        ? "GREEN"
        : outcome === "NOT_COMPLETED"
          ? "YELLOW"
          : existing.status;

  if (nextStatus === existing.status) return state;

  const nextPlan: MonthPlan = {
    ...plan,
    tasks: plan.tasks.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)),
  };

  return upsertMonth(state, nextPlan);
}

export function setTaskOutcome(
  state: AppStateV0,
  date: DateISO,
  taskId: string,
  outcome: "COMPLETED" | "NOT_COMPLETED" | undefined
): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);

  const nextMap = { ...day.outcomeByTaskId };
  if (outcome) nextMap[taskId] = outcome;
  else delete nextMap[taskId];

  let next = updateDay(withDay, { ...day, outcomeByTaskId: nextMap });
  next = applyStatusToMonth(next, ym, taskId, outcome);
  return next;
}

export function setShutdownNote(
  state: AppStateV0,
  date: DateISO,
  note: { comment: string; pending: string } | undefined
): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  return updateDay(withDay, { ...day, shutdownNote: note });
}
