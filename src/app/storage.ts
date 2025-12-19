import type { AppStateV0, DateISO, MonthPlan, YM, DayEntry, ProductivitySession } from "./types";

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
