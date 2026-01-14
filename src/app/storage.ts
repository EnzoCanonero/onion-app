import type {
  AppStateV0,
  DateISO,
  MonthPlan,
  YM,
  DayEntry,
  ProductivitySession,
  TaskNode,
  MeetingEntry,
} from "./types";

const KEY = "focustree.state";

const emptyState: AppStateV0 = { version: 0, months: {}, days: {}, sessions: [], meetings: [] };

export function loadState(): AppStateV0 {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState;
    const parsed = JSON.parse(raw) as AppStateV0;
    if (parsed?.version !== 0) return emptyState;

    // v4 migration: Add meetings array if not present
    if (!parsed.meetings) {
      parsed.meetings = [];
    }

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

  // v2: Toggle behavior - clicking the same outcome reverts to NONE
  const nextStatus =
    outcome === "COMPLETED"
      ? existing.status === "GREEN" ? "NONE" : "GREEN"  // Toggle GREEN ↔ NONE
      : outcome === "NOT_COMPLETED"
        ? existing.status === "YELLOW" ? "NONE" : "YELLOW"  // Toggle YELLOW ↔ NONE
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

export function setDailyJournal(
  state: AppStateV0,
  date: DateISO,
  journal: string | undefined
): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  return updateDay(withDay, { ...day, dailyJournal: journal });
}

export function setPendingNote(
  state: AppStateV0,
  date: DateISO,
  note: string | undefined
): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  return updateDay(withDay, { ...day, pendingNote: note });
}

export function setShutdownNote(
  state: AppStateV0,
  date: DateISO,
  note: string | undefined
): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  return updateDay(withDay, { ...day, shutdownNote: note });
}

// v2: Task tree editing functions

export function updateTaskInMonth(
  state: AppStateV0,
  ym: YM,
  taskId: string,
  updates: Partial<Pick<TaskNode, "title" | "parentId" | "status">>
): AppStateV0 {
  const plan = getMonth(state, ym);
  if (!plan) return state;

  const nextTasks = plan.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t));
  return upsertMonth(state, { ...plan, tasks: nextTasks });
}

export function deleteTaskFromMonth(
  state: AppStateV0,
  ym: YM,
  taskId: string,
  cascadeChildren: boolean = true
): AppStateV0 {
  const plan = getMonth(state, ym);
  if (!plan) return state;

  let toDelete = new Set([taskId]);

  if (cascadeChildren) {
    // Find all descendants recursively
    const findChildren = (parentId: string) => {
      plan.tasks.forEach((t) => {
        if (t.parentId === parentId && !toDelete.has(t.id)) {
          toDelete.add(t.id);
          findChildren(t.id);
        }
      });
    };
    findChildren(taskId);
  }

  const nextTasks = plan.tasks.filter((t) => !toDelete.has(t.id));
  const nextSnapshot = plan.initialSnapshotTaskIds.filter((id) => !toDelete.has(id));

  return upsertMonth(state, { ...plan, tasks: nextTasks, initialSnapshotTaskIds: nextSnapshot });
}

export function reorderTaskInMonth(
  state: AppStateV0,
  ym: YM,
  taskId: string,
  direction: "up" | "down"
): AppStateV0 {
  const plan = getMonth(state, ym);
  if (!plan) return state;

  const task = plan.tasks.find((t) => t.id === taskId);
  if (!task) return state;

  // Get siblings (tasks with same parentId)
  const siblings = plan.tasks.filter((t) => t.parentId === task.parentId);
  const currentIndex = siblings.findIndex((t) => t.id === taskId);

  if (currentIndex === -1) return state;
  if (direction === "up" && currentIndex === 0) return state;
  if (direction === "down" && currentIndex === siblings.length - 1) return state;

  const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  const swapTask = siblings[newIndex];

  // Swap positions by reordering the entire tasks array
  const nextTasks = plan.tasks.map((t) => {
    if (t.id === taskId) return { ...t };
    if (t.id === swapTask.id) return { ...t };
    return t;
  });

  // Find actual indices in the full array and swap
  const taskFullIndex = nextTasks.findIndex((t) => t.id === taskId);
  const swapFullIndex = nextTasks.findIndex((t) => t.id === swapTask.id);

  [nextTasks[taskFullIndex], nextTasks[swapFullIndex]] = [nextTasks[swapFullIndex], nextTasks[taskFullIndex]];

  return upsertMonth(state, { ...plan, tasks: nextTasks });
}

export function moveTaskInMonth(
  state: AppStateV0,
  ym: YM,
  taskId: string,
  newParentId: string | null
): AppStateV0 {
  const plan = getMonth(state, ym);
  if (!plan) return state;

  // Prevent moving a task to be a child of itself or its descendants
  if (newParentId) {
    let checkParent: string | null = newParentId;
    while (checkParent) {
      if (checkParent === taskId) return state; // Circular reference detected
      const parent = plan.tasks.find((t) => t.id === checkParent);
      checkParent = parent?.parentId ?? null;
    }
  }

  return updateTaskInMonth(state, ym, taskId, { parentId: newParentId });
}

// v2: Utility functions

export function findPreviousDayEntry(state: AppStateV0, currentDate: DateISO, ym: YM): DayEntry | undefined {
  const sorted = Object.values(state.days)
    .filter((d) => d.date < currentDate && d.ym === ym)
    .sort((a, b) => b.date.localeCompare(a.date));
  return sorted[0];
}

export function findLastWorkingDay(state: AppStateV0, currentDate: DateISO, ym: YM): DayEntry | undefined {
  const sorted = Object.values(state.days)
    .filter((d) => d.date < currentDate && d.ym === ym && d.isWorkingDay === true)
    .sort((a, b) => b.date.localeCompare(a.date));
  return sorted[0];
}

export function activateWorkingDay(state: AppStateV0, date: DateISO): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  return updateDay(withDay, { ...day, isWorkingDay: true });
}

// v4: Close/Reopen day functionality
export function closeDay(state: AppStateV0, date: DateISO): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);

  // End any active session before closing
  let next = withDay;
  if (day.activeSessionId) {
    const session = next.sessions.find((s) => s.id === day.activeSessionId);
    if (session?.startedAt) {
      const endedAt = new Date().toISOString();
      const ms = Date.parse(endedAt) - Date.parse(session.startedAt);
      const minutes = Math.max(0, Math.round(ms / 60000));
      next = updateSession(next, day.activeSessionId, { endedAt, actualMinutes: minutes });
    }
  }

  return updateDay(next, { ...day, isClosed: true, activeSessionId: undefined });
}

export function reopenDay(state: AppStateV0, date: DateISO): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  return updateDay(withDay, { ...day, isClosed: false });
}

export function formatTime(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "—";
  }
}

export function getChildrenIds(tasks: TaskNode[], parentId: string | null): string[] {
  return tasks.filter((t) => t.parentId === parentId).map((t) => t.id);
}

export function countDescendants(tasks: TaskNode[], taskId: string): number {
  let count = 0;
  const children = tasks.filter((t) => t.parentId === taskId);
  children.forEach((child) => {
    count += 1 + countDescendants(tasks, child.id);
  });
  return count;
}

// v3: Date navigation utility functions

export function getTodayDate(): DateISO {
  return new Date().toISOString().slice(0, 10) as DateISO;
}

export function isValidDateISO(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return date.toISOString().slice(0, 10) === dateStr;
}

export function getCurrentYM(): YM {
  return getTodayDate().slice(0, 7) as YM;
}

export function formatDateDisplay(date: DateISO): string {
  try {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return date;
  }
}

// v4: Meeting management functions

export function addMeeting(state: AppStateV0, meeting: MeetingEntry): AppStateV0 {
  return { ...state, meetings: [meeting, ...state.meetings] };
}

export function updateMeeting(
  state: AppStateV0,
  meetingId: string,
  updates: Partial<Omit<MeetingEntry, 'id' | 'createdAt'>>
): AppStateV0 {
  return {
    ...state,
    meetings: state.meetings.map((m) =>
      m.id === meetingId ? { ...m, ...updates } : m
    ),
  };
}

export function deleteMeeting(state: AppStateV0, meetingId: string): AppStateV0 {
  return {
    ...state,
    meetings: state.meetings.filter((m) => m.id !== meetingId),
  };
}

export function getMeetingsForDate(meetings: MeetingEntry[], date: DateISO): MeetingEntry[] {
  return meetings
    .filter((m) => m.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function toggleMeetingAttended(state: AppStateV0, meetingId: string): AppStateV0 {
  return {
    ...state,
    meetings: state.meetings.map((m) =>
      m.id === meetingId ? { ...m, attended: !m.attended } : m
    ),
  };
}

// v4: Daily reminders toggle functions

export function toggleEmailChecked(state: AppStateV0, date: DateISO): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  return updateDay(withDay, { ...day, emailChecked: !day.emailChecked });
}

export function toggleBureaucraticsCompleted(state: AppStateV0, date: DateISO): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  return updateDay(withDay, { ...day, bureaucraticsCompleted: !day.bureaucraticsCompleted });
}
