import type {
  AppStateV0,
  DateISO,
  MonthPlan,
  YM,
  DayEntry,
  ProductivitySession,
  TaskNode,
  MeetingEntry,
  GrandPlan,
  Category,
  MilestoneNode,
  FocusTemplate,
  DailyReminderTemplate,
} from "./types";
import { normalizeWeekdays } from "./weekdays";

const KEY = "focustree.state";

const DEFAULT_DAILY_REMINDER_TEMPLATES: DailyReminderTemplate[] = [
  { id: "rem_email", text: "Check your email 📧" },
  { id: "rem_bureaucratic", text: "Handle those bureaucratic tasks 📋" },
];

const emptyState: AppStateV0 = {
  version: 0,
  months: {},
  days: {},
  sessions: [],
  meetings: [],
  dailyReminderTemplates: DEFAULT_DAILY_REMINDER_TEMPLATES,
};

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

    // v7 migration: Add editable daily reminder templates + migrate old booleans
    if (!Array.isArray(parsed.dailyReminderTemplates)) {
      parsed.dailyReminderTemplates = DEFAULT_DAILY_REMINDER_TEMPLATES;
    } else {
      parsed.dailyReminderTemplates = parsed.dailyReminderTemplates
        .filter(
          (t: any) => t && typeof t.id === "string" && typeof t.text === "string"
        )
        .map((t: any) => ({ id: t.id, text: t.text }));
    }

    for (const day of Object.values(parsed.days ?? {})) {
      const nextMap: Record<string, boolean> = { ...(day.reminderCheckedById ?? {}) };
      if (typeof day.emailChecked === "boolean" && nextMap.rem_email === undefined) {
        nextMap.rem_email = day.emailChecked;
      }
      if (typeof day.bureaucraticsCompleted === "boolean" && nextMap.rem_bureaucratic === undefined) {
        nextMap.rem_bureaucratic = day.bureaucraticsCompleted;
      }
      if (Object.keys(nextMap).length > 0) {
        day.reminderCheckedById = nextMap;
      }
    }

    // v8 migration: Remove legacy snapshot fields + add explicit month pins
    const validMilestoneIds = new Set<string>(parsed.grandPlan?.milestones?.map((m) => m.id) ?? []);
    for (const plan of Object.values(parsed.months ?? {})) {
      if (!plan || typeof plan !== "object") continue;

      if ("initialSnapshotTaskIds" in (plan as any)) {
        delete (plan as any).initialSnapshotTaskIds;
      }

      const existingPins = Array.isArray((plan as any).pinnedMilestoneIds)
        ? (plan as any).pinnedMilestoneIds.filter((id: any) => typeof id === "string")
        : [];

      // If no pins exist yet, derive them from any linked tasks/templates (legacy linking behavior)
      const derivedPins: string[] = [];
      const seen = new Set<string>();
      const pushIfValid = (id: unknown) => {
        if (typeof id !== "string" || !id) return;
        if (seen.has(id)) return;
        if (validMilestoneIds.size > 0 && !validMilestoneIds.has(id)) return;
        seen.add(id);
        derivedPins.push(id);
      };

      (plan as any).tasks?.forEach((t: any) => pushIfValid(t?.linkedMilestoneId));
      (plan as any).templates?.forEach((t: any) => pushIfValid(t?.linkedMilestoneId));

      const pinsToUse = existingPins.length > 0 ? existingPins : derivedPins;
      (plan as any).pinnedMilestoneIds =
        validMilestoneIds.size > 0 ? pinsToUse.filter((id: string) => validMilestoneIds.has(id)) : pinsToUse;

      // v9 migration: Normalize template weekday scheduling
      if (Array.isArray((plan as any).templates)) {
        (plan as any).templates.forEach((t: any) => {
          const normalized = normalizeWeekdays(t?.daysOfWeek);
          if (normalized === undefined) return;
          if (normalized.length === 0) {
            delete t.daysOfWeek;
          } else {
            t.daysOfWeek = normalized;
          }
        });
      }
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

  let nextState = upsertMonth(state, nextPlan);

  // v6.2: Auto-progress milestone to IN_PROGRESS when a task is marked
  if (existing.linkedMilestoneId && nextState.grandPlan && (nextStatus === "GREEN" || nextStatus === "YELLOW")) {
    const milestone = nextState.grandPlan.milestones.find((m) => m.id === existing.linkedMilestoneId);
    if (milestone && milestone.status === "NOT_STARTED") {
      nextState = {
        ...nextState,
        grandPlan: {
          ...nextState.grandPlan,
          milestones: nextState.grandPlan.milestones.map((m) =>
            m.id === existing.linkedMilestoneId ? { ...m, status: "IN_PROGRESS" } : m
          ),
          updatedAt: new Date().toISOString(),
        },
      };
    }
  }

  return nextState;
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
  updates: Partial<Pick<TaskNode, "title" | "description" | "parentId" | "status">>
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
  return upsertMonth(state, { ...plan, tasks: nextTasks });
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

// v5: Close/Reopen month functionality
export function closeMonth(state: AppStateV0, ym: YM): AppStateV0 {
  const plan = getMonth(state, ym);
  if (!plan) return state;

  const closedPlan: MonthPlan = { ...plan, isClosed: true };
  return upsertMonth(state, closedPlan);
}

export function reopenMonth(state: AppStateV0, ym: YM): AppStateV0 {
  const plan = getMonth(state, ym);
  if (!plan) return state;

  const reopenedPlan: MonthPlan = { ...plan, isClosed: false };
  return upsertMonth(state, reopenedPlan);
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

// v7: Editable reminders (templates + per-day checked state)

export function setDailyReminderTemplates(state: AppStateV0, templates: DailyReminderTemplate[]): AppStateV0 {
  const nextTemplates = templates
    .filter((t) => t && typeof t.id === "string" && typeof t.text === "string")
    .map((t) => ({ id: t.id, text: t.text.trim() }))
    .filter((t) => t.id.trim() && t.text);

  return { ...state, dailyReminderTemplates: nextTemplates };
}

export function toggleReminderChecked(state: AppStateV0, date: DateISO, reminderId: string): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  const current = day.reminderCheckedById?.[reminderId] ?? false;
  const nextMap = { ...(day.reminderCheckedById ?? {}) };
  nextMap[reminderId] = !current;
  return updateDay(withDay, { ...day, reminderCheckedById: nextMap });
}

// v6: Grand Plan functions

export function createGrandPlan(
  state: AppStateV0,
  title: string,
  startMonth: YM,
  endMonth?: YM
): AppStateV0 {
  const now = new Date().toISOString();
  const grandPlan: GrandPlan = {
    id: makeId("gp"),
    title,
    startMonth,
    endMonth,
    categories: [],
    milestones: [],
    createdAt: now,
    updatedAt: now,
  };
  return { ...state, grandPlan };
}

export function createGrandPlanWithExamples(
  state: AppStateV0,
  title: string,
  startMonth: YM,
  endMonth?: YM
): AppStateV0 {
  const now = new Date().toISOString();

  // Create example categories
  const catWork: Category = {
    id: makeId("cat"),
    title: "Career",
    color: "#2196f3",
    order: 1,
    createdAt: now,
  };

  const catHealth: Category = {
    id: makeId("cat"),
    title: "Health & Fitness",
    color: "#4caf50",
    order: 2,
    createdAt: now,
  };

  // Create example milestones for Career (bottom-to-top: first steps -> goal)
  const workMs1: MilestoneNode = {
    id: makeId("ms"),
    categoryId: catWork.id,
    parentId: null,
    title: "Get promoted to Senior",
    description: "Achieve senior position within the year",
    status: "NOT_STARTED",
    order: 1,
    createdAt: now,
  };

  const workMs2: MilestoneNode = {
    id: makeId("ms"),
    categoryId: catWork.id,
    parentId: workMs1.id,
    title: "Lead a major project",
    description: "Take ownership of a key initiative",
    status: "NOT_STARTED",
    order: 1,
    createdAt: now,
  };

  const workMs3: MilestoneNode = {
    id: makeId("ms"),
    categoryId: catWork.id,
    parentId: workMs2.id,
    title: "Complete advanced training",
    description: "Finish relevant certifications",
    status: "NOT_STARTED",
    order: 1,
    createdAt: now,
  };

  // Create example milestones for Health (bottom-to-top: first steps -> goal)
  const healthMs1: MilestoneNode = {
    id: makeId("ms"),
    categoryId: catHealth.id,
    parentId: null,
    title: "Run a half marathon",
    description: "Complete 21km race",
    status: "NOT_STARTED",
    order: 1,
    createdAt: now,
  };

  const healthMs2: MilestoneNode = {
    id: makeId("ms"),
    categoryId: catHealth.id,
    parentId: healthMs1.id,
    title: "Run 10K comfortably",
    description: "Build endurance for longer distances",
    status: "NOT_STARTED",
    order: 1,
    createdAt: now,
  };

  const healthMs3: MilestoneNode = {
    id: makeId("ms"),
    categoryId: catHealth.id,
    parentId: healthMs2.id,
    title: "Establish running routine",
    description: "Run 3x per week consistently",
    status: "NOT_STARTED",
    order: 1,
    createdAt: now,
  };

  const grandPlan: GrandPlan = {
    id: makeId("gp"),
    title,
    startMonth,
    endMonth,
    categories: [catWork, catHealth],
    milestones: [workMs1, workMs2, workMs3, healthMs1, healthMs2, healthMs3],
    createdAt: now,
    updatedAt: now,
  };

  return { ...state, grandPlan };
}

export function updateGrandPlan(
  state: AppStateV0,
  updates: Partial<Pick<GrandPlan, "title" | "startMonth" | "endMonth">>
): AppStateV0 {
  if (!state.grandPlan) return state;
  return {
    ...state,
    grandPlan: {
      ...state.grandPlan,
      ...updates,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function deleteGrandPlan(state: AppStateV0): AppStateV0 {
  // v6.1: Clean up linkedMilestoneId from all tasks in all months
  const cleanedMonths: Record<string, MonthPlan> = {};
  for (const [ym, plan] of Object.entries(state.months)) {
    const cleanedTasks = plan.tasks.map((t) => {
      const { linkedMilestoneId, ...rest } = t;
      return rest as TaskNode;
    });
    cleanedMonths[ym] = { ...plan, tasks: cleanedTasks, pinnedMilestoneIds: [] };
  }
  return { ...state, grandPlan: undefined, months: cleanedMonths };
}

// Category CRUD

export function addCategory(state: AppStateV0, title: string, color: string): AppStateV0 {
  if (!state.grandPlan) return state;
  const maxOrder = Math.max(0, ...state.grandPlan.categories.map((c) => c.order));
  const category: Category = {
    id: makeId("cat"),
    title,
    color,
    order: maxOrder + 1,
    createdAt: new Date().toISOString(),
  };
  return {
    ...state,
    grandPlan: {
      ...state.grandPlan,
      categories: [...state.grandPlan.categories, category],
      updatedAt: new Date().toISOString(),
    },
  };
}

export function updateCategory(
  state: AppStateV0,
  categoryId: string,
  updates: Partial<Pick<Category, "title" | "color" | "order">>
): AppStateV0 {
  if (!state.grandPlan) return state;
  return {
    ...state,
    grandPlan: {
      ...state.grandPlan,
      categories: state.grandPlan.categories.map((c) =>
        c.id === categoryId ? { ...c, ...updates } : c
      ),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function deleteCategory(state: AppStateV0, categoryId: string): AppStateV0 {
  if (!state.grandPlan) return state;

  // Delete all milestones in this category
  const milestoneIds = new Set(
    state.grandPlan.milestones.filter((m) => m.categoryId === categoryId).map((m) => m.id)
  );

  // v6.1: Clean up linkedMilestoneId from tasks linked to deleted milestones
  // v6.3: Also unlink templates (set to null = standalone)
  const cleanedMonths: Record<string, MonthPlan> = {};
  for (const [ym, plan] of Object.entries(state.months)) {
    const cleanedTasks = plan.tasks.map((t) => {
      if (t.linkedMilestoneId && milestoneIds.has(t.linkedMilestoneId)) {
        const { linkedMilestoneId, ...rest } = t;
        return rest as TaskNode;
      }
      return t;
    });
    const cleanedTemplates = plan.templates.map((t) => {
      if (t.linkedMilestoneId && milestoneIds.has(t.linkedMilestoneId)) {
        return { ...t, linkedMilestoneId: null };
      }
      return t;
    });
    const nextPinned = (plan.pinnedMilestoneIds ?? []).filter((id) => !milestoneIds.has(id));
    cleanedMonths[ym] = { ...plan, tasks: cleanedTasks, templates: cleanedTemplates, pinnedMilestoneIds: nextPinned };
  }

  return {
    ...state,
    months: cleanedMonths,
    grandPlan: {
      ...state.grandPlan,
      categories: state.grandPlan.categories.filter((c) => c.id !== categoryId),
      milestones: state.grandPlan.milestones.filter((m) => m.categoryId !== categoryId),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function reorderCategory(state: AppStateV0, categoryId: string, direction: "up" | "down"): AppStateV0 {
  if (!state.grandPlan) return state;

  const sorted = [...state.grandPlan.categories].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((c) => c.id === categoryId);
  if (idx === -1) return state;
  if (direction === "up" && idx === 0) return state;
  if (direction === "down" && idx === sorted.length - 1) return state;

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  const currentOrder = sorted[idx].order;
  const swapOrder = sorted[swapIdx].order;

  return {
    ...state,
    grandPlan: {
      ...state.grandPlan,
      categories: state.grandPlan.categories.map((c) => {
        if (c.id === categoryId) return { ...c, order: swapOrder };
        if (c.id === sorted[swapIdx].id) return { ...c, order: currentOrder };
        return c;
      }),
      updatedAt: new Date().toISOString(),
    },
  };
}

// Milestone CRUD

export function addMilestone(
  state: AppStateV0,
  categoryId: string,
  title: string,
  parentId: string | null
): AppStateV0 {
  if (!state.grandPlan) return state;

  // Calculate order among siblings
  const siblings = state.grandPlan.milestones.filter(
    (m) => m.categoryId === categoryId && m.parentId === parentId
  );
  const maxOrder = Math.max(0, ...siblings.map((m) => m.order));

  const milestone: MilestoneNode = {
    id: makeId("ms"),
    categoryId,
    parentId,
    title,
    status: "NOT_STARTED",
    order: maxOrder + 1,
    createdAt: new Date().toISOString(),
  };

  return {
    ...state,
    grandPlan: {
      ...state.grandPlan,
      milestones: [...state.grandPlan.milestones, milestone],
      updatedAt: new Date().toISOString(),
    },
  };
}

export function updateMilestone(
  state: AppStateV0,
  milestoneId: string,
  updates: Partial<Pick<MilestoneNode, "title" | "description" | "status" | "parentId">>
): AppStateV0 {
  if (!state.grandPlan) return state;
  return {
    ...state,
    grandPlan: {
      ...state.grandPlan,
      milestones: state.grandPlan.milestones.map((m) =>
        m.id === milestoneId ? { ...m, ...updates } : m
      ),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function deleteMilestone(state: AppStateV0, milestoneId: string, cascadeChildren: boolean = true): AppStateV0 {
  if (!state.grandPlan) return state;

  let toDelete = new Set([milestoneId]);

  if (cascadeChildren) {
    const findChildren = (parentId: string) => {
      state.grandPlan!.milestones.forEach((m) => {
        if (m.parentId === parentId && !toDelete.has(m.id)) {
          toDelete.add(m.id);
          findChildren(m.id);
        }
      });
    };
    findChildren(milestoneId);
  }

  // v6.1: Clean up linkedMilestoneId from tasks linked to deleted milestones
  // v6.3: Also unlink templates (set to null = standalone)
  const cleanedMonths: Record<string, MonthPlan> = {};
  for (const [ym, plan] of Object.entries(state.months)) {
    const cleanedTasks = plan.tasks.map((t) => {
      if (t.linkedMilestoneId && toDelete.has(t.linkedMilestoneId)) {
        const { linkedMilestoneId, ...rest } = t;
        return rest as TaskNode;
      }
      return t;
    });
    const cleanedTemplates = plan.templates.map((t) => {
      if (t.linkedMilestoneId && toDelete.has(t.linkedMilestoneId)) {
        return { ...t, linkedMilestoneId: null };
      }
      return t;
    });
    const nextPinned = (plan.pinnedMilestoneIds ?? []).filter((id) => !toDelete.has(id));
    cleanedMonths[ym] = { ...plan, tasks: cleanedTasks, templates: cleanedTemplates, pinnedMilestoneIds: nextPinned };
  }

  return {
    ...state,
    months: cleanedMonths,
    grandPlan: {
      ...state.grandPlan,
      milestones: state.grandPlan.milestones.filter((m) => !toDelete.has(m.id)),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function reorderMilestone(state: AppStateV0, milestoneId: string, direction: "up" | "down"): AppStateV0 {
  if (!state.grandPlan) return state;

  const milestone = state.grandPlan.milestones.find((m) => m.id === milestoneId);
  if (!milestone) return state;

  const siblings = state.grandPlan.milestones
    .filter((m) => m.categoryId === milestone.categoryId && m.parentId === milestone.parentId)
    .sort((a, b) => a.order - b.order);

  const idx = siblings.findIndex((m) => m.id === milestoneId);
  if (idx === -1) return state;
  if (direction === "up" && idx === 0) return state;
  if (direction === "down" && idx === siblings.length - 1) return state;

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  const currentOrder = siblings[idx].order;
  const swapOrder = siblings[swapIdx].order;

  return {
    ...state,
    grandPlan: {
      ...state.grandPlan,
      milestones: state.grandPlan.milestones.map((m) => {
        if (m.id === milestoneId) return { ...m, order: swapOrder };
        if (m.id === siblings[swapIdx].id) return { ...m, order: currentOrder };
        return m;
      }),
      updatedAt: new Date().toISOString(),
    },
  };
}

// v6.1: Task with milestone linking

export function addTaskWithMilestone(
  state: AppStateV0,
  ym: YM,
  title: string,
  milestoneId: string,
  parentId: string | null = null
): { state: AppStateV0; task: TaskNode } | { state: AppStateV0; task: undefined } {
  const plan = getMonth(state, ym);
  if (!plan) return { state, task: undefined };

  const task: TaskNode = {
    id: makeId("task"),
    title,
    parentId,
    status: "NONE",
    linkedMilestoneId: milestoneId,
  };

  const pinned = Array.isArray(plan.pinnedMilestoneIds) ? plan.pinnedMilestoneIds : [];
  const nextPinned = pinned.includes(milestoneId) ? pinned : [...pinned, milestoneId];
  const nextPlan: MonthPlan = { ...plan, tasks: [...plan.tasks, task], pinnedMilestoneIds: nextPinned };
  return { state: upsertMonth(state, nextPlan), task };
}

export function getMilestonesInMonth(state: AppStateV0, ym: YM): MilestoneNode[] {
  const plan = getMonth(state, ym);
  if (!plan || !state.grandPlan) return [];

  const byId = new Map(state.grandPlan.milestones.map((m) => [m.id, m]));

  const orderedIds: string[] = [];
  const seen = new Set<string>();

  const push = (id: unknown) => {
    if (typeof id !== "string" || !id) return;
    if (seen.has(id)) return;
    if (!byId.has(id)) return;
    seen.add(id);
    orderedIds.push(id);
  };

  // Prefer explicit month pins first (in user order)
  (plan.pinnedMilestoneIds ?? []).forEach((id) => push(id));

  // Also include any milestones referenced by tasks/templates (legacy / safety)
  plan.tasks.forEach((t) => push(t.linkedMilestoneId));
  plan.templates.forEach((t) => push(t.linkedMilestoneId));

  return orderedIds.map((id) => byId.get(id)!).filter(Boolean);
}

export function getTasksForMilestone(state: AppStateV0, ym: YM, milestoneId: string): TaskNode[] {
  const plan = getMonth(state, ym);
  if (!plan) return [];
  return plan.tasks.filter((t) => t.linkedMilestoneId === milestoneId);
}

export function getStandaloneTasks(state: AppStateV0, ym: YM): TaskNode[] {
  const plan = getMonth(state, ym);
  if (!plan) return [];
  return plan.tasks.filter((t) => !t.linkedMilestoneId);
}

// Validation

export function isMonthInGrandPlanPeriod(state: AppStateV0, ym: YM): boolean {
  if (!state.grandPlan) return false;
  const { startMonth, endMonth } = state.grandPlan;
  if (ym < startMonth) return false;
  if (endMonth && ym > endMonth) return false;
  return true;
}

export function canCreateMonth(state: AppStateV0, ym: YM): { allowed: boolean; reason?: string } {
  if (!state.grandPlan) {
    return { allowed: true }; // No grand plan = no restrictions
  }
  if (isMonthInGrandPlanPeriod(state, ym)) {
    return { allowed: true };
  }
  const { startMonth, endMonth } = state.grandPlan;
  const periodStr = endMonth ? `${startMonth} to ${endMonth}` : `${startMonth} onwards`;
  return {
    allowed: false,
    reason: `Month ${ym} is outside the Grand Plan period (${periodStr})`,
  };
}

// v6.3: Focus template helpers for milestone grouping

export function getTemplatesForMilestone(state: AppStateV0, ym: YM, milestoneId: string): FocusTemplate[] {
  const plan = getMonth(state, ym);
  if (!plan) return [];
  return plan.templates.filter((t) => t.linkedMilestoneId === milestoneId);
}

export function getStandaloneTemplates(state: AppStateV0, ym: YM): FocusTemplate[] {
  const plan = getMonth(state, ym);
  if (!plan) return [];
  // null or undefined = standalone (for migration)
  return plan.templates.filter((t) => t.linkedMilestoneId === null || t.linkedMilestoneId === undefined);
}
