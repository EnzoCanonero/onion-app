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
  DayLogEvent,
  MeetingRecurrence,
  TaskArchive,
} from "./types";
import { normalizeWeekdays } from "./weekdays";
import { getVirtualTodayDate, getVirtualCurrentYM, getVirtualTimestamp } from "../contexts/VirtualClockContext";
import { getStorageBackend } from "./storageBackend";

export const STATE_KEY = "onion-app.state";
const KEY = STATE_KEY;

const DEFAULT_DAILY_REMINDER_TEMPLATES: DailyReminderTemplate[] = [
  { id: "rem_email", text: "Check your email 📧" },
  { id: "rem_bureaucratic", text: "Handle those bureaucratic tasks 📋" },
];

function createEmptyTaskArchive(): TaskArchive {
  return {
    standaloneTasks: [],
    tasksByMilestoneId: {},
    boardByScope: {},
    taskLinksByScope: {},
  };
}

function getTaskScopeKey(milestoneId: string | null | undefined) {
  return milestoneId ? `milestone:${milestoneId}` : "standalone";
}

function getTaskScopeMilestoneId(scopeKey: string): string | undefined {
  return scopeKey.startsWith("milestone:") ? scopeKey.slice("milestone:".length) || undefined : undefined;
}

function getLegacyMeetingSeriesKey(meeting: {
  createdAt?: string;
  recurrence?: MeetingRecurrence;
  title?: string;
  time?: string;
  link?: string;
  description?: string;
}) {
  return JSON.stringify([
    meeting.createdAt ?? "",
    meeting.recurrence ?? "NONE",
    meeting.title ?? "",
    meeting.time ?? "",
    meeting.link ?? "",
    meeting.description ?? "",
  ]);
}

const emptyState: AppStateV0 = {
  version: 0,
  months: {},
  taskArchive: createEmptyTaskArchive(),
  days: {},
  sessions: [],
  meetings: [],
  dailyReminderTemplates: DEFAULT_DAILY_REMINDER_TEMPLATES,
};

export function loadState(): AppStateV0 {
  try {
    const raw = getStorageBackend().getItem(KEY);
    if (!raw) return emptyState;
    const parsed = JSON.parse(raw) as AppStateV0;
    if (parsed?.version !== 0) return emptyState;
    let didNormalizeTaskNotes = false;
    let didMigrateTaskArchive = false;
    let didMigrateMeetingSeries = false;
    let didNormalizeMilestoneTreeNames = false;

    const validMilestoneIds = new Set<string>(parsed.grandPlan?.milestones?.map((m) => m.id) ?? []);
    const taskMapsByScope = new Map<string, Map<string, TaskNode>>();
    const boardByScope: Record<string, { width: number; height: number }> = {};
    const taskLinksByScope: Record<string, { from: string; to: string }[]> = {};

    const mergeBoardScope = (scopeKey: string, board: any) => {
      if (!board || typeof board !== "object") return;
      const width = typeof board.width === "number" && Number.isFinite(board.width) ? board.width : undefined;
      const height = typeof board.height === "number" && Number.isFinite(board.height) ? board.height : undefined;
      if (!width || !height) return;
      const milestoneId = getTaskScopeMilestoneId(scopeKey);
      if (milestoneId && validMilestoneIds.size > 0 && !validMilestoneIds.has(milestoneId)) {
        didMigrateTaskArchive = true;
        return;
      }
      boardByScope[scopeKey] = { width, height };
    };

    const mergeTaskLinksScope = (scopeKey: string, links: any) => {
      if (!Array.isArray(links)) return;
      const milestoneId = getTaskScopeMilestoneId(scopeKey);
      if (milestoneId && validMilestoneIds.size > 0 && !validMilestoneIds.has(milestoneId)) {
        didMigrateTaskArchive = true;
        return;
      }
      taskLinksByScope[scopeKey] = links
        .filter((link) => link && typeof link.from === "string" && typeof link.to === "string")
        .map((link) => ({ from: link.from, to: link.to }));
    };

    const normalizeTask = (
      task: any,
      fallbackMilestoneId: string | undefined,
      fallbackCreatedAt: string | undefined
    ): TaskNode | null => {
      if (!task || typeof task !== "object") return null;
      const title = typeof task.title === "string" ? task.title.trim() : "";
      if (!title) return null;
      const prevDescription = task.description;
      const prevNotes = task.notes;
      const legacyDescription = typeof task.description === "string" ? task.description.trim() : "";
      const currentNotes = typeof task.notes === "string" ? task.notes.trim() : "";
      const nextNotes = legacyDescription || currentNotes;
      let linkedMilestoneId =
        typeof task.linkedMilestoneId === "string" && task.linkedMilestoneId
          ? task.linkedMilestoneId
          : fallbackMilestoneId;
      if (linkedMilestoneId && validMilestoneIds.size > 0 && !validMilestoneIds.has(linkedMilestoneId)) {
        linkedMilestoneId = undefined;
        didMigrateTaskArchive = true;
      }
      const status = task.status === "GREEN" || task.status === "YELLOW" ? task.status : "NONE";
      const createdAt =
        typeof task.createdAt === "string" && task.createdAt
          ? task.createdAt
          : fallbackCreatedAt;
      const completedAt =
        status === "GREEN" && typeof task.completedAt === "string" && task.completedAt
          ? task.completedAt
          : undefined;
      if (prevDescription !== undefined || prevNotes !== nextNotes) {
        didNormalizeTaskNotes = true;
      }
      return {
        id: typeof task.id === "string" && task.id ? task.id : makeId("task"),
        title,
        notes: nextNotes || undefined,
        boardX: typeof task.boardX === "number" && Number.isFinite(task.boardX) ? task.boardX : undefined,
        boardY: typeof task.boardY === "number" && Number.isFinite(task.boardY) ? task.boardY : undefined,
        boardW: typeof task.boardW === "number" && Number.isFinite(task.boardW) ? task.boardW : undefined,
        boardH: typeof task.boardH === "number" && Number.isFinite(task.boardH) ? task.boardH : undefined,
        parentId: typeof task.parentId === "string" && task.parentId ? task.parentId : null,
        status,
        linkedMilestoneId,
        createdAt,
        completedAt,
      };
    };

    const mergeTaskList = (
      tasks: any,
      fallbackMilestoneId: string | undefined,
      fallbackCreatedAt: string | undefined
    ) => {
      if (!Array.isArray(tasks)) return;
      tasks.forEach((task) => {
        const normalized = normalizeTask(task, fallbackMilestoneId, fallbackCreatedAt);
        if (!normalized) return;
        const scopeKey = getTaskScopeKey(normalized.linkedMilestoneId);
        const byId = taskMapsByScope.get(scopeKey) ?? new Map<string, TaskNode>();
        const existing = byId.get(normalized.id);
        byId.set(normalized.id, {
          ...existing,
          ...normalized,
          createdAt: existing?.createdAt ?? normalized.createdAt,
          completedAt:
            normalized.status === "GREEN"
              ? normalized.completedAt ?? existing?.completedAt
              : undefined,
        });
        taskMapsByScope.set(scopeKey, byId);
      });
    };

    // v4 migration: Add meetings array if not present
    if (!parsed.meetings) {
      parsed.meetings = [];
    }
    const legacyRecurringMeetingsByKey = new Map<string, MeetingEntry[]>();
    parsed.meetings = parsed.meetings
      .filter((meeting: any) => meeting && typeof meeting === "object")
      .map((meeting: any) => {
        const recurrence =
          meeting.recurrence === "WEEKLY" ||
          meeting.recurrence === "BIWEEKLY" ||
          meeting.recurrence === "MONTHLY"
            ? (meeting.recurrence as MeetingRecurrence)
            : undefined;
        const normalizedMeeting: MeetingEntry = {
          id: typeof meeting.id === "string" && meeting.id ? meeting.id : makeId("meeting"),
          date: meeting.date as DateISO,
          ym:
            typeof meeting.ym === "string" && meeting.ym
              ? meeting.ym
              : ymFromDate(meeting.date as DateISO),
          title: typeof meeting.title === "string" ? meeting.title : "Meeting",
          time: typeof meeting.time === "string" ? meeting.time : "09:00-10:00",
          link: typeof meeting.link === "string" && meeting.link ? meeting.link : undefined,
          description:
            typeof meeting.description === "string" && meeting.description
              ? meeting.description
              : undefined,
          attended: typeof meeting.attended === "boolean" ? meeting.attended : undefined,
          skipped: typeof meeting.skipped === "boolean" ? meeting.skipped : undefined,
          createdAt: typeof meeting.createdAt === "string" && meeting.createdAt ? meeting.createdAt : getVirtualTimestamp(),
          recurrence,
          seriesId:
            recurrence && typeof meeting.seriesId === "string" && meeting.seriesId
              ? meeting.seriesId
              : undefined,
        };

        if (!recurrence && meeting.seriesId) {
          didMigrateMeetingSeries = true;
        }

        if (recurrence && !normalizedMeeting.seriesId) {
          const groupKey = getLegacyMeetingSeriesKey(normalizedMeeting);
          const existing = legacyRecurringMeetingsByKey.get(groupKey) ?? [];
          existing.push(normalizedMeeting);
          legacyRecurringMeetingsByKey.set(groupKey, existing);
        }

        return normalizedMeeting;
      });

    legacyRecurringMeetingsByKey.forEach((meetings) => {
      const nextSeriesId = makeId("meeting_series");
      meetings.forEach((meeting) => {
        meeting.seriesId = nextSeriesId;
      });
      didMigrateMeetingSeries = true;
    });

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

      if (Array.isArray((day as any).events)) {
        (day as any).events = (day as any).events
          .filter((e: any) => e && typeof e.id === "string" && typeof e.at === "string" && typeof e.kind === "string" && typeof e.text === "string")
          .map((e: any) => ({ id: e.id, at: e.at, kind: e.kind, text: e.text }));
      } else {
        delete (day as any).events;
      }
    }

    if (!parsed.taskArchive || typeof parsed.taskArchive !== "object") {
      parsed.taskArchive = createEmptyTaskArchive();
      didMigrateTaskArchive = true;
    }

    const existingArchive = parsed.taskArchive ?? createEmptyTaskArchive();
    mergeTaskList(existingArchive.standaloneTasks, undefined, undefined);
    Object.entries(existingArchive.tasksByMilestoneId ?? {}).forEach(([milestoneId, tasks]) => {
      mergeTaskList(tasks, milestoneId, undefined);
    });
    Object.entries(existingArchive.boardByScope ?? {}).forEach(([scopeKey, board]) => {
      mergeBoardScope(scopeKey, board);
    });
    Object.entries(existingArchive.taskLinksByScope ?? {}).forEach(([scopeKey, links]) => {
      mergeTaskLinksScope(scopeKey, links);
    });

    // v8 migration: Remove legacy snapshot fields + add explicit month pins
    for (const plan of Object.values(parsed.months ?? {})) {
      if (!plan || typeof plan !== "object") continue;

      if ("initialSnapshotTaskIds" in (plan as any)) {
        delete (plan as any).initialSnapshotTaskIds;
      }

      const existingPins = Array.isArray((plan as any).pinnedMilestoneIds)
        ? (plan as any).pinnedMilestoneIds.filter((id: any) => typeof id === "string")
        : [];

      // If no pins exist yet, derive them from any linked tasks (legacy linking behavior)
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

      const pinsToUse = existingPins.length > 0 ? existingPins : derivedPins;
      (plan as any).pinnedMilestoneIds =
        validMilestoneIds.size > 0 ? pinsToUse.filter((id: string) => validMilestoneIds.has(id)) : pinsToUse;

      // v8.1: Clean up linkedMilestoneId on tasks pointing to non-existent milestones
      if (validMilestoneIds.size > 0 && Array.isArray((plan as any).tasks)) {
        (plan as any).tasks.forEach((t: any) => {
          if (t?.linkedMilestoneId && !validMilestoneIds.has(t.linkedMilestoneId)) {
            delete t.linkedMilestoneId;
          }
        });
      }

      if (typeof (plan as any).primaryMilestoneId !== "string") {
        const nextPrimary = (plan as any).pinnedMilestoneIds?.[0];
        if (typeof nextPrimary === "string" && nextPrimary) {
          (plan as any).primaryMilestoneId = nextPrimary;
        }
      }

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

      if (Array.isArray((plan as any).tasks) && (plan as any).tasks.length > 0) {
        mergeTaskList((plan as any).tasks, undefined, plan.createdAt);
        didMigrateTaskArchive = true;
      }

      Object.entries((plan as any).boardByScope ?? {}).forEach(([scopeKey, board]) => {
        mergeBoardScope(scopeKey, board);
        didMigrateTaskArchive = true;
      });

      Object.entries((plan as any).taskLinksByScope ?? {}).forEach(([scopeKey, links]) => {
        mergeTaskLinksScope(scopeKey, links);
        didMigrateTaskArchive = true;
      });

      if ((plan as any).stashedByMilestone && typeof (plan as any).stashedByMilestone === "object") {
        Object.entries((plan as any).stashedByMilestone).forEach(([milestoneId, bucket]: [string, any]) => {
          mergeTaskList(bucket?.tasks, milestoneId, plan.createdAt);
          mergeBoardScope(getTaskScopeKey(milestoneId), bucket?.board);
          mergeTaskLinksScope(getTaskScopeKey(milestoneId), bucket?.links);
          didMigrateTaskArchive = true;
        });
      }

      if ("tasks" in (plan as any)) {
        delete (plan as any).tasks;
        didMigrateTaskArchive = true;
      }
      if ("boardByScope" in (plan as any)) {
        delete (plan as any).boardByScope;
        didMigrateTaskArchive = true;
      }
      if ("taskLinksByScope" in (plan as any)) {
        delete (plan as any).taskLinksByScope;
        didMigrateTaskArchive = true;
      }
      if ("stashedByMilestone" in (plan as any)) {
        delete (plan as any).stashedByMilestone;
        didMigrateTaskArchive = true;
      }
    }

    const nextTasksByMilestoneId: Record<string, TaskNode[]> = {};
    taskMapsByScope.forEach((tasksById, scopeKey) => {
      const tasks = Array.from(tasksById.values());
      const milestoneId = getTaskScopeMilestoneId(scopeKey);
      if (milestoneId) nextTasksByMilestoneId[milestoneId] = tasks;
    });
    parsed.taskArchive = {
      standaloneTasks: Array.from(taskMapsByScope.get("standalone")?.values() ?? []),
      tasksByMilestoneId: nextTasksByMilestoneId,
      boardByScope,
      taskLinksByScope,
    };

    if (parsed.grandPlan?.milestones) {
      parsed.grandPlan.milestones.forEach((m) => {
        const rawTreeName = m.treeName;
        const nextTreeName = typeof rawTreeName === "string" ? rawTreeName.trim() : "";
        if (m.parentId === null && nextTreeName) {
          if (rawTreeName !== nextTreeName) {
            didNormalizeMilestoneTreeNames = true;
          }
          m.treeName = nextTreeName;
        } else if (rawTreeName !== undefined) {
          delete m.treeName;
          didNormalizeMilestoneTreeNames = true;
        }

        if (m.status === "COMPLETED" && !m.completedAt) {
          m.completedAt = m.createdAt;
        }
      });
    }

    if (didNormalizeTaskNotes || didMigrateTaskArchive || didMigrateMeetingSeries || didNormalizeMilestoneTreeNames) {
      saveState(parsed);
    }

    return parsed;
  } catch {
    return emptyState;
  }
}

export function saveState(state: AppStateV0) {
  getStorageBackend().setItem(KEY, JSON.stringify(state));
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

export function appendDayEvent(state: AppStateV0, date: DateISO, event: DayLogEvent): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  const events = Array.isArray(day.events) ? day.events : [];
  return updateDay(withDay, { ...day, events: [...events, event] });
}

export function upsertDayEvent(state: AppStateV0, date: DateISO, event: DayLogEvent): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  const events = Array.isArray(day.events) ? day.events : [];
  const existingIndex = events.findIndex((candidate) => candidate.id === event.id);
  const nextEvents =
    existingIndex === -1
      ? [...events, event]
      : events.map((candidate, index) => (index === existingIndex ? event : candidate));
  return updateDay(withDay, { ...day, events: nextEvents });
}

export function removeDayEvent(state: AppStateV0, date: DateISO, eventId: string): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  const events = Array.isArray(day.events) ? day.events : [];
  const nextEvents = events.filter((event) => event.id !== eventId);
  if (nextEvents.length === events.length) return withDay;
  return updateDay(withDay, { ...day, events: nextEvents });
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

export function getTaskArchive(state: AppStateV0): TaskArchive {
  return state.taskArchive ?? createEmptyTaskArchive();
}

function setTaskBucket(
  archive: TaskArchive,
  milestoneId: string | undefined,
  tasks: TaskNode[]
): TaskArchive {
  const normalized = tasks.map((task) => ({
    ...task,
    linkedMilestoneId: milestoneId,
  }));

  if (milestoneId) {
    const nextByMilestoneId = { ...archive.tasksByMilestoneId };
    if (normalized.length > 0) nextByMilestoneId[milestoneId] = normalized;
    else delete nextByMilestoneId[milestoneId];
    return { ...archive, tasksByMilestoneId: nextByMilestoneId };
  }

  return {
    ...archive,
    standaloneTasks: normalized.map((task) => ({ ...task, linkedMilestoneId: undefined })),
  };
}

function updateTaskArchive(
  state: AppStateV0,
  updater: (archive: TaskArchive) => TaskArchive
): AppStateV0 {
  return {
    ...state,
    taskArchive: updater(getTaskArchive(state)),
  };
}

function findTaskBucketById(
  archive: TaskArchive,
  taskId: string
): { milestoneId: string | undefined; tasks: TaskNode[]; task: TaskNode } | undefined {
  const standaloneTask = archive.standaloneTasks.find((task) => task.id === taskId);
  if (standaloneTask) {
    return { milestoneId: undefined, tasks: archive.standaloneTasks, task: standaloneTask };
  }

  for (const [milestoneId, tasks] of Object.entries(archive.tasksByMilestoneId)) {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (task) return { milestoneId, tasks, task };
  }

  return undefined;
}

export function getAllTasks(state: AppStateV0): TaskNode[] {
  const archive = getTaskArchive(state);
  return [
    ...archive.standaloneTasks,
    ...Object.values(archive.tasksByMilestoneId).flat(),
  ];
}

export function getTaskById(state: AppStateV0, taskId: string): TaskNode | undefined {
  const archive = getTaskArchive(state);
  return findTaskBucketById(archive, taskId)?.task;
}

export function getFrozenTaskIds(state: AppStateV0): Set<string> {
  const frozenTaskIds = new Set<string>();
  Object.values(state.days).forEach((day) => {
    if (!day.isClosed) return;
    Object.entries(day.outcomeByTaskId ?? {}).forEach(([taskId, outcome]) => {
      if (outcome === "COMPLETED") frozenTaskIds.add(taskId);
    });
  });
  return frozenTaskIds;
}

export function isTaskFrozen(state: AppStateV0, taskId: string): boolean {
  return getFrozenTaskIds(state).has(taskId);
}

function buildHistoricalTaskProtection(state: AppStateV0): {
  descendantLockedTaskIds: Set<string>;
  directParentLockedTaskIds: Set<string>;
} {
  const tasks = getAllTasks(state);
  const tasksById = new Map(tasks.map((task) => [task.id, task] as const));
  const frozenTaskIds = getFrozenTaskIds(state);
  const descendantLockedTaskIds = new Set<string>();
  const directParentLockedTaskIds = new Set<string>();

  frozenTaskIds.forEach((taskId) => {
    const task = tasksById.get(taskId);
    let parentId = task?.parentId ?? null;
    if (parentId) directParentLockedTaskIds.add(parentId);
    while (parentId) {
      descendantLockedTaskIds.add(parentId);
      parentId = tasksById.get(parentId)?.parentId ?? null;
    }
  });

  return { descendantLockedTaskIds, directParentLockedTaskIds };
}

export function hasHistoricallyCompletedDescendant(state: AppStateV0, taskId: string): boolean {
  return buildHistoricalTaskProtection(state).descendantLockedTaskIds.has(taskId);
}

export function isParentOfHistoricallyCompletedSubtask(state: AppStateV0, taskId: string): boolean {
  return buildHistoricalTaskProtection(state).directParentLockedTaskIds.has(taskId);
}

export function getDeleteLockedTaskIds(state: AppStateV0): Set<string> {
  return buildHistoricalTaskProtection(state).descendantLockedTaskIds;
}

export function getTitleLockedTaskIds(state: AppStateV0): Set<string> {
  return buildHistoricalTaskProtection(state).directParentLockedTaskIds;
}

export function getTasksForMilestone(state: AppStateV0, milestoneId: string): TaskNode[] {
  return getTaskArchive(state).tasksByMilestoneId[milestoneId] ?? [];
}

export function getStandaloneTasks(state: AppStateV0): TaskNode[] {
  return getTaskArchive(state).standaloneTasks;
}

export function getTasksForMonth(state: AppStateV0, ym: YM): TaskNode[] {
  const plan = getMonth(state, ym);
  if (!plan) return [];

  const archive = getTaskArchive(state);
  const ordered: TaskNode[] = [];
  const seen = new Set<string>();
  const push = (task: TaskNode) => {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    ordered.push(task);
  };

  archive.standaloneTasks.forEach(push);
  (plan.pinnedMilestoneIds ?? []).forEach((milestoneId) => {
    (archive.tasksByMilestoneId[milestoneId] ?? []).forEach(push);
  });

  return ordered;
}

export function getTaskBoardForScope(
  state: AppStateV0,
  scopeKey: string
): { width: number; height: number } | undefined {
  return getTaskArchive(state).boardByScope[scopeKey];
}

export function getTaskLinksForScope(
  state: AppStateV0,
  scopeKey: string
): { from: string; to: string }[] {
  return getTaskArchive(state).taskLinksByScope[scopeKey] ?? [];
}

export function updateTaskBoardForScope(
  state: AppStateV0,
  scopeKey: string,
  board: { width: number; height: number }
): AppStateV0 {
  return updateTaskArchive(state, (archive) => ({
    ...archive,
    boardByScope: { ...archive.boardByScope, [scopeKey]: board },
  }));
}

export function updateTaskLinksForScope(
  state: AppStateV0,
  scopeKey: string,
  links: { from: string; to: string }[]
): AppStateV0 {
  return updateTaskArchive(state, (archive) => ({
    ...archive,
    taskLinksByScope: { ...archive.taskLinksByScope, [scopeKey]: links },
  }));
}

export function addStandaloneTask(
  state: AppStateV0,
  title: string,
  parentId: string | null = null,
  notes?: string
): { state: AppStateV0; task: TaskNode } {
  const task: TaskNode = {
    id: makeId("task"),
    title,
    notes: notes?.trim() || undefined,
    parentId,
    status: "NONE",
    createdAt: getVirtualTimestamp(),
  };

  return {
    state: updateTaskArchive(state, (archive) => ({
      ...archive,
      standaloneTasks: [...archive.standaloneTasks, task],
    })),
    task,
  };
}

export function addTaskWithMilestone(
  state: AppStateV0,
  title: string,
  milestoneId: string,
  parentId: string | null = null,
  notes?: string
): { state: AppStateV0; task: TaskNode } {
  const archive = getTaskArchive(state);
  const existingTasks = archive.tasksByMilestoneId[milestoneId] ?? [];
  const task: TaskNode = {
    id: makeId("task"),
    title,
    notes: notes?.trim() || undefined,
    parentId,
    status: "NONE",
    linkedMilestoneId: milestoneId,
    createdAt: getVirtualTimestamp(),
  };

  return {
    state: updateTaskArchive(state, (current) =>
      setTaskBucket(current, milestoneId, [...existingTasks, task])
    ),
    task,
  };
}

export function addSubtask(
  state: AppStateV0,
  parentTaskId: string,
  title: string
): { state: AppStateV0; task: TaskNode } {
  const archive = getTaskArchive(state);
  const parentBucket = findTaskBucketById(archive, parentTaskId);
  if (!parentBucket) return { state, task: { id: "", title, parentId: parentTaskId, status: "NONE" } };
  if (isTaskFrozen(state, parentTaskId) || parentBucket.task.status === "GREEN") {
    return { state, task: { id: "", title, parentId: parentTaskId, status: "NONE" } };
  }

  const subtask: TaskNode = {
    id: makeId("task"),
    title,
    parentId: parentTaskId,
    status: "NONE",
    linkedMilestoneId: parentBucket.task.linkedMilestoneId,
    createdAt: getVirtualTimestamp(),
  };

  return {
    state: updateTaskArchive(state, (current) =>
      setTaskBucket(current, parentBucket.milestoneId, [...parentBucket.tasks, subtask])
    ),
    task: subtask,
  };
}

function getParentTaskFromBucket(tasks: TaskNode[], task: TaskNode): TaskNode | undefined {
  if (!task.parentId) return undefined;
  return tasks.find((candidate) => candidate.id === task.parentId);
}

function isBlockedByCompletedParent(tasks: TaskNode[], task: TaskNode, nextStatus: TaskNode["status"]): boolean {
  const parent = getParentTaskFromBucket(tasks, task);
  return parent?.status === "GREEN" && nextStatus !== "GREEN";
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

export function applyTaskStatus(
  state: AppStateV0,
  taskId: string,
  outcome: "COMPLETED" | "NOT_COMPLETED" | undefined
): AppStateV0 {
  if (isTaskFrozen(state, taskId)) return state;
  const archive = getTaskArchive(state);
  const existingBucket = findTaskBucketById(archive, taskId);
  if (!existingBucket) return state;
  const existing = existingBucket.task;

  // v2: Toggle behavior - clicking the same outcome reverts to NONE
  const nextStatus =
    outcome === "COMPLETED"
      ? existing.status === "GREEN" ? "NONE" : "GREEN"  // Toggle GREEN ↔ NONE
      : outcome === "NOT_COMPLETED"
        ? existing.status === "YELLOW" ? "NONE" : "YELLOW"  // Toggle YELLOW ↔ NONE
        : existing.status;

  if (nextStatus === existing.status) return state;

  if (isBlockedByCompletedParent(existingBucket.tasks, existing, nextStatus)) return state;

  // Subtask rules: if this task has subtasks, enforce constraints
  const subtasks = existingBucket.tasks.filter((t) => t.parentId === taskId);
  if (subtasks.length > 0) {
    if (nextStatus === "GREEN" && subtasks.some((s) => s.status !== "GREEN")) return state;
    if (nextStatus === "YELLOW" && !subtasks.some((s) => s.status === "YELLOW" || s.status === "GREEN")) return state;
  }

  const now = getVirtualTimestamp();
  let nextTasks = existingBucket.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          status: nextStatus,
          completedAt: nextStatus === "GREEN" ? task.completedAt ?? now : undefined,
        }
      : task
  );

  // Subtask rule: marking a subtask as WIP/completed auto-marks parent as WIP
  if (existing.parentId && (nextStatus === "YELLOW" || nextStatus === "GREEN")) {
    const parent = nextTasks.find((t) => t.id === existing.parentId);
    if (parent && parent.status === "NONE") {
      nextTasks = nextTasks.map((t) => t.id === existing.parentId ? { ...t, status: "YELLOW" } : t);
    }
  }

  let nextState = updateTaskArchive(state, (current) =>
    setTaskBucket(current, existingBucket.milestoneId, nextTasks)
  );

  // v6.2: Auto-progress milestone to IN_PROGRESS when a task is marked
  const linkedMilestoneId = existing.linkedMilestoneId ?? (existing.parentId ? existingBucket.tasks.find((t) => t.id === existing.parentId)?.linkedMilestoneId : undefined);
  if (linkedMilestoneId && nextState.grandPlan && (nextStatus === "GREEN" || nextStatus === "YELLOW")) {
    const milestone = nextState.grandPlan.milestones.find((m) => m.id === linkedMilestoneId);
    if (milestone && milestone.status === "NOT_STARTED") {
      nextState = {
        ...nextState,
        grandPlan: {
          ...nextState.grandPlan,
          milestones: nextState.grandPlan.milestones.map((m) =>
            m.id === linkedMilestoneId ? { ...m, status: "IN_PROGRESS" } : m
          ),
          updatedAt: getVirtualTimestamp(),
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
  if (isTaskFrozen(state, taskId)) return state;
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  const currentOutcome = day.outcomeByTaskId?.[taskId];
  const nextOutcome = outcome && currentOutcome === outcome ? undefined : outcome;
  const nextMap = { ...day.outcomeByTaskId };
  if (nextOutcome) nextMap[taskId] = nextOutcome;
  else delete nextMap[taskId];

  const archive = getTaskArchive(withDay);
  const existingBucket = findTaskBucketById(archive, taskId);
  if (!existingBucket) {
    return updateDay(withDay, { ...day, outcomeByTaskId: nextMap });
  }

  const existing = existingBucket.task;
  const nextStatus =
    nextOutcome === "COMPLETED"
      ? "GREEN"
      : nextOutcome === "NOT_COMPLETED"
        ? "YELLOW"
        : "NONE";
  if (isBlockedByCompletedParent(existingBucket.tasks, existing, nextStatus)) return state;

  // Subtask rules: if this task has subtasks, enforce constraints
  const subtasks = existingBucket.tasks.filter((t) => t.parentId === taskId);
  if (subtasks.length > 0) {
    if (nextOutcome === "COMPLETED" && subtasks.some((s) => s.status !== "GREEN")) return state;
    if (nextOutcome === "NOT_COMPLETED" && !subtasks.some((s) => s.status === "YELLOW" || s.status === "GREEN")) return state;
  }

  const completedAt =
    nextStatus === "GREEN"
      ? existing.completedAt && existing.completedAt.slice(0, 10) === date
        ? existing.completedAt
        : date < getTodayDate()
          ? localTimestampForDate(date, 23, 59, 59)
          : getVirtualTimestamp()
      : undefined;

  let nextTasks = existingBucket.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          status: nextStatus,
          completedAt,
        }
      : task
  );

  // Subtask rule: marking a subtask as WIP/completed auto-marks parent as WIP
  if (existing.parentId && (nextStatus === "YELLOW" || nextStatus === "GREEN")) {
    const parent = nextTasks.find((t) => t.id === existing.parentId);
    if (parent && parent.status === "NONE") {
      nextTasks = nextTasks.map((t) => t.id === existing.parentId ? { ...t, status: "YELLOW" } : t);
    }
  }

  let next = updateDay(withDay, { ...day, outcomeByTaskId: nextMap });
  next = updateTaskArchive(next, (current) =>
    setTaskBucket(current, existingBucket.milestoneId, nextTasks)
  );

  const linkedMilestoneId = existing.linkedMilestoneId ?? (existing.parentId ? existingBucket.tasks.find((t) => t.id === existing.parentId)?.linkedMilestoneId : undefined);
  if (linkedMilestoneId && next.grandPlan && nextStatus !== "NONE") {
    const milestone = next.grandPlan.milestones.find((m) => m.id === linkedMilestoneId);
    if (milestone && milestone.status === "NOT_STARTED") {
      next = {
        ...next,
        grandPlan: {
          ...next.grandPlan,
          milestones: next.grandPlan.milestones.map((m) =>
            m.id === linkedMilestoneId ? { ...m, status: "IN_PROGRESS" } : m
          ),
          updatedAt: getVirtualTimestamp(),
        },
      };
    }
  }

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

// v10: Per-day focus template -> milestone assignment (Daily-only UI, does not change Month templates)
export function setFocusTemplateMilestoneForDay(
  state: AppStateV0,
  date: DateISO,
  templateId: string,
  milestoneId: string | undefined
): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  const prev = day.focusMilestoneByTemplateId ?? {};
  const nextMap = { ...prev };
  if (milestoneId && milestoneId.trim()) nextMap[templateId] = milestoneId;
  else delete nextMap[templateId];
  return updateDay(withDay, { ...day, focusMilestoneByTemplateId: nextMap });
}

// v2: Task tree editing functions

export function updateTask(
  state: AppStateV0,
  taskId: string,
  updates: Partial<Pick<TaskNode, "title" | "notes" | "boardX" | "boardY" | "boardW" | "boardH" | "parentId" | "status">>
): AppStateV0 {
  if (isTaskFrozen(state, taskId)) return state;
  const archive = getTaskArchive(state);
  const existingBucket = findTaskBucketById(archive, taskId);
  if (!existingBucket) return state;
  const existingTask = existingBucket.task;
  if (
    updates.title !== undefined &&
    updates.title !== existingTask.title &&
    isParentOfHistoricallyCompletedSubtask(state, taskId)
  ) {
    return state;
  }

  const nextTasks = existingBucket.tasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task));
  return updateTaskArchive(state, (current) =>
    setTaskBucket(current, existingBucket.milestoneId, nextTasks)
  );
}

export function deleteTask(
  state: AppStateV0,
  taskId: string,
  cascadeChildren: boolean = true
): AppStateV0 {
  if (isTaskFrozen(state, taskId)) return state;
  const archive = getTaskArchive(state);
  const existingBucket = findTaskBucketById(archive, taskId);
  if (!existingBucket) return state;

  let toDelete = new Set([taskId]);

  if (cascadeChildren) {
    // Find all descendants recursively
    const findChildren = (parentId: string) => {
      existingBucket.tasks.forEach((t) => {
        if (t.parentId === parentId && !toDelete.has(t.id)) {
          toDelete.add(t.id);
          findChildren(t.id);
        }
      });
    };
    findChildren(taskId);
  }

  if (Array.from(toDelete).some((id) => isTaskFrozen(state, id))) return state;

  const nextTasks = existingBucket.tasks.filter((t) => !toDelete.has(t.id));
  const nextLinks = (archive.taskLinksByScope[getTaskScopeKey(existingBucket.milestoneId)] ?? []).filter(
    (link) => !toDelete.has(link.from) && !toDelete.has(link.to)
  );

  return updateTaskArchive(state, (current) => {
    const nextArchive = setTaskBucket(current, existingBucket.milestoneId, nextTasks);
    return {
      ...nextArchive,
      taskLinksByScope: {
        ...nextArchive.taskLinksByScope,
        [getTaskScopeKey(existingBucket.milestoneId)]: nextLinks,
      },
    };
  });
}

export function reorderTask(
  state: AppStateV0,
  taskId: string,
  direction: "up" | "down"
): AppStateV0 {
  if (isTaskFrozen(state, taskId)) return state;
  const archive = getTaskArchive(state);
  const existingBucket = findTaskBucketById(archive, taskId);
  if (!existingBucket) return state;

  const task = existingBucket.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return state;

  // Get siblings (tasks with same parentId)
  const siblings = existingBucket.tasks.filter((t) => t.parentId === task.parentId);
  const currentIndex = siblings.findIndex((t) => t.id === taskId);

  if (currentIndex === -1) return state;
  if (direction === "up" && currentIndex === 0) return state;
  if (direction === "down" && currentIndex === siblings.length - 1) return state;

  const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  const swapTask = siblings[newIndex];

  // Swap positions by reordering the entire tasks array
  const nextTasks = existingBucket.tasks.map((t) => {
    if (t.id === taskId) return { ...t };
    if (t.id === swapTask.id) return { ...t };
    return t;
  });

  // Find actual indices in the full array and swap
  const taskFullIndex = nextTasks.findIndex((t) => t.id === taskId);
  const swapFullIndex = nextTasks.findIndex((t) => t.id === swapTask.id);

  [nextTasks[taskFullIndex], nextTasks[swapFullIndex]] = [nextTasks[swapFullIndex], nextTasks[taskFullIndex]];

  return updateTaskArchive(state, (current) =>
    setTaskBucket(current, existingBucket.milestoneId, nextTasks)
  );
}

export function moveTask(
  state: AppStateV0,
  taskId: string,
  newParentId: string | null
): AppStateV0 {
  if (isTaskFrozen(state, taskId)) return state;
  const archive = getTaskArchive(state);
  const existingBucket = findTaskBucketById(archive, taskId);
  if (!existingBucket) return state;

  // Prevent moving a task to be a child of itself or its descendants
  if (newParentId) {
    let checkParent: string | null = newParentId;
    while (checkParent) {
      if (checkParent === taskId) return state; // Circular reference detected
      const parent = existingBucket.tasks.find((t) => t.id === checkParent);
      checkParent = parent?.parentId ?? null;
    }
  }

  return updateTask(state, taskId, { parentId: newParentId });
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
  const startedAt = day.startedAt ?? getVirtualTimestamp();
  return updateDay(withDay, { ...day, isWorkingDay: true, startedAt });
}

// v4: Close/Reopen day functionality
function localTimestampForDate(date: DateISO, hours: number, minutes: number, seconds = 0): string {
  const [y, m, d] = date.split("-").map((part) => Number(part));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return getVirtualTimestamp();
  return new Date(y, m - 1, d, hours, minutes, seconds, 0).toISOString();
}

function endOfDayTimestamp(date: DateISO): string {
  return localTimestampForDate(date, 23, 59, 59);
}

function defaultStartedAtTimestamp(date: DateISO): string {
  return localTimestampForDate(date, 9, 0, 0);
}

function hasCompletedDescendantForArchive(
  state: AppStateV0,
  day: DayEntry,
  taskId: string
): boolean {
  const archive = getTaskArchive(state);
  const existingBucket = findTaskBucketById(archive, taskId);
  if (!existingBucket) return false;

  const frozenTaskIds = getFrozenTaskIds(state);
  const stack = existingBucket.tasks
    .filter((task) => task.parentId === taskId)
    .map((task) => task.id);

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) continue;
    if (frozenTaskIds.has(currentId) || day.outcomeByTaskId?.[currentId] === "COMPLETED") {
      return true;
    }
    existingBucket.tasks.forEach((task) => {
      if (task.parentId === currentId) stack.push(task.id);
    });
  }

  return false;
}

function buildArchivedTaskOutcomeMapForClose(
  state: AppStateV0,
  day: DayEntry
): Record<string, "COMPLETED" | "NOT_COMPLETED"> {
  const nextMap: Record<string, "COMPLETED" | "NOT_COMPLETED"> = {
    ...(day.outcomeByTaskId ?? {}),
  };

  Object.entries(nextMap).forEach(([taskId, outcome]) => {
    const task = getTaskById(state, taskId);
    if (task?.parentId && outcome === "NOT_COMPLETED") {
      delete nextMap[taskId];
    }
  });

  const selectedTopLevelTaskIds = [day.primaryTaskId, ...day.secondaryTaskIds].filter(
    (taskId): taskId is string => Boolean(taskId)
  );

  selectedTopLevelTaskIds.forEach((taskId) => {
    const task = getTaskById(state, taskId);
    if (!task || task.parentId) return;
    if (nextMap[taskId] === "COMPLETED") return;

    const shouldArchiveAsWip =
      task.status === "YELLOW" && hasCompletedDescendantForArchive(state, day, taskId);

    if (shouldArchiveAsWip) {
      nextMap[taskId] = "NOT_COMPLETED";
      return;
    }

    if (nextMap[taskId] === "NOT_COMPLETED") {
      delete nextMap[taskId];
    }
  });

  return nextMap;
}

export function closeDay(state: AppStateV0, date: DateISO): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);

  if (day.isClosed) return withDay;

  const isPastDate = date < getTodayDate();
  const endedAt = isPastDate ? endOfDayTimestamp(date) : getVirtualTimestamp();
  const autoClosed = isPastDate;

  // End any active session before closing
  let next = withDay;
  if (day.activeSessionId) {
    const session = next.sessions.find((s) => s.id === day.activeSessionId);
    if (session?.startedAt) {
      const ms = Date.parse(endedAt) - Date.parse(session.startedAt);
      const minutes = Math.max(0, Math.round(ms / 60000));
      next = updateSession(next, day.activeSessionId, { endedAt, actualMinutes: minutes });
    }
  }

  const archivedOutcomeByTaskId = buildArchivedTaskOutcomeMapForClose(next, day);
  const updated = updateDay(next, {
    ...day,
    isClosed: true,
    activeSessionId: undefined,
    endedAt,
    autoClosed,
    outcomeByTaskId: archivedOutcomeByTaskId,
  });
  const hasEndedEvent = Array.isArray(day.events)
    ? day.events.some((e) => e.kind === "SYSTEM" && e.text === "Day ended")
    : false;
  if (hasEndedEvent) return updated;
  return appendDayEvent(updated, date, {
    id: makeId("evt"),
    at: endedAt,
    kind: "SYSTEM",
    text: "Day ended",
  });
}

export function autoCloseDay(state: AppStateV0, date: DateISO): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);

  if (day.isClosed) return withDay;

  const endedAt = endOfDayTimestamp(date);

  let next = withDay;
  if (day.activeSessionId) {
    const session = next.sessions.find((s) => s.id === day.activeSessionId);
    if (session?.startedAt) {
      const ms = Date.parse(endedAt) - Date.parse(session.startedAt);
      const minutes = Math.max(0, Math.round(ms / 60000));
      next = updateSession(next, day.activeSessionId, { endedAt, actualMinutes: minutes });
    }
  }

  const archivedOutcomeByTaskId = buildArchivedTaskOutcomeMapForClose(next, day);
  const updated = updateDay(next, {
    ...day,
    isClosed: true,
    activeSessionId: undefined,
    endedAt,
    autoClosed: true,
    outcomeByTaskId: archivedOutcomeByTaskId,
  });
  const hasEndedEvent = Array.isArray(day.events)
    ? day.events.some((e) => e.kind === "SYSTEM" && e.text === "Day ended")
    : false;
  if (hasEndedEvent) return updated;
  return appendDayEvent(updated, date, {
    id: makeId("evt"),
    at: endedAt,
    kind: "SYSTEM",
    text: "Day ended",
  });
}

export function reopenDay(state: AppStateV0, date: DateISO): AppStateV0 {
  if (date < getTodayDate()) return state;
  const ym = ymFromDate(date);
  const reopened = reopenMonth(state, ym);
  const { state: withDay, day } = getOrCreateDay(reopened, date, ym);
  const cleanedEvents = Array.isArray(day.events)
    ? day.events.filter((e) => !(e.kind === "SYSTEM" && e.text === "Day ended"))
    : day.events;
  return updateDay(withDay, {
    ...day,
    isClosed: false,
    endedAt: undefined,
    autoClosed: false,
    events: cleanedEvents,
  });
}

// v5: Close/Reopen month functionality
export function closeMonth(state: AppStateV0, ym: YM): AppStateV0 {
  const plan = getMonth(state, ym);
  if (!plan) return state;

  let next = state;

  // If closing the current month, also close today's day (if it's open)
  const today = getTodayDate();
  if (today.slice(0, 7) === ym) {
    const day0 = next.days[today];
    if (day0 && !day0.isClosed && (day0.isWorkingDay === true || !!day0.activeSessionId)) {
      next = closeDay(next, today);
    }
  }

  const closedPlan: MonthPlan = { ...plan, isClosed: true };
  return upsertMonth(next, closedPlan);
}

export function autoCloseMonth(state: AppStateV0, ym: YM): AppStateV0 {
  const plan = getMonth(state, ym);
  if (!plan || plan.isClosed) return state;
  const closedPlan: MonthPlan = { ...plan, isClosed: true };
  return upsertMonth(state, closedPlan);
}

export function reopenMonth(state: AppStateV0, ym: YM): AppStateV0 {
  let next = state;
  if (next.grandPlan?.isClosed) {
    next = reopenGrandPlan(next);
  }

  const plan = getMonth(next, ym);
  if (!plan) return next;

  const reopenedPlan: MonthPlan = { ...plan, isClosed: false };
  return upsertMonth(next, reopenedPlan);
}

export function formatTime(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "—";
  }
}

export function getSubtasksForTask(state: AppStateV0, parentTaskId: string): TaskNode[] {
  const archive = getTaskArchive(state);
  const bucket = findTaskBucketById(archive, parentTaskId);
  if (!bucket) return [];
  return bucket.tasks.filter((t) => t.parentId === parentTaskId);
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
  return getVirtualTodayDate();
}

export function isValidDateISO(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return date.toISOString().slice(0, 10) === dateStr;
}

export function getCurrentYM(): YM {
  return getVirtualCurrentYM();
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

function meetingStartTimestamp(date: DateISO, time: string): string | undefined {
  const start = time.split("-")[0]?.trim();
  const parts = start?.split(":").map((part) => Number(part));
  if (!parts || parts.length !== 2) return undefined;
  const [hours, minutes] = parts;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined;
  return localTimestampForDate(date, hours, minutes, 0);
}

function getEventTimestamp(
  day: DayEntry,
  eventId: string,
  kind: DayLogEvent["kind"],
  legacyText: string | undefined,
  fallbackAt: string
): string {
  const events = Array.isArray(day.events) ? day.events : [];
  const exactMatch = events.find((event) => event.id === eventId);
  if (exactMatch?.at) return exactMatch.at;
  if (legacyText) {
    const legacyMatch = events.find((event) => event.kind === kind && event.text === legacyText);
    if (legacyMatch?.at) return legacyMatch.at;
  }
  return fallbackAt;
}

function getTaskCompletionEventTimestamp(
  day: DayEntry,
  eventId: string,
  kind: DayLogEvent["kind"],
  text: string,
  fallbackAt: string,
  legacyEventId?: string,
  legacyText?: string
): string {
  const events = Array.isArray(day.events) ? day.events : [];
  const exactMatch = events.find((event) => event.id === eventId);
  if (exactMatch?.at) return exactMatch.at;

  const exactTextMatch = events.find((event) => event.kind === kind && event.text === text);
  if (exactTextMatch?.at) return exactTextMatch.at;

  if (legacyEventId) {
    const legacyIdMatch = events.find((event) => event.id === legacyEventId);
    if (legacyIdMatch?.at) return legacyIdMatch.at;
  }

  if (legacyText) {
    const legacyTextMatch = events.find((event) => event.kind === "TASK" && event.text === legacyText);
    if (legacyTextMatch?.at) return legacyTextMatch.at;
  }

  return fallbackAt;
}

export function buildDayHistory(
  state: AppStateV0,
  date: DateISO,
  plan?: MonthPlan
): DayLogEvent[] {
  const day = state.days[date];
  if (!day) return [];

  const activePlan = plan ?? getMonth(state, day.ym);
  const tasksById = new Map(getAllTasks(state).map((task) => [task.id, task] as const));
  const remindersById = new Map(state.dailyReminderTemplates.map((reminder) => [reminder.id, reminder] as const));
  const templateTitleById = new Map((activePlan?.templates ?? []).map((template) => [template.id, template.title] as const));
  const derivedEvents: DayLogEvent[] = [];

  if (day.startedAt) {
    derivedEvents.push({
      id: `system:day-started:${date}`,
      at: day.startedAt,
      kind: "SYSTEM",
      text: "Day started",
    });
  }

  if (day.endedAt) {
    derivedEvents.push({
      id: `system:day-ended:${date}`,
      at: day.endedAt,
      kind: "SYSTEM",
      text: "Day ended",
    });
  }

  Object.entries(day.reminderCheckedById ?? {}).forEach(([reminderId, checked]) => {
    if (!checked) return;
    const reminderText = remindersById.get(reminderId)?.text ?? reminderId;
    const fallbackAt = day.startedAt ?? localTimestampForDate(date, 9, 0, 0);
    derivedEvents.push({
      id: `reminder:checked:${reminderId}`,
      at: getEventTimestamp(day, `reminder:checked:${reminderId}`, "REMINDER", reminderText, fallbackAt),
      kind: "REMINDER",
      text: reminderText,
    });
  });

  Object.entries(day.outcomeByTaskId ?? {}).forEach(([taskId, outcome]) => {
    if (outcome !== "COMPLETED") return;
    const task = tasksById.get(taskId);
    const title = task?.title ?? "Unknown task";
    const parentTask = task?.parentId ? tasksById.get(task.parentId) : undefined;
    const isSubtask = Boolean(task?.parentId);
    const legacyText = `✓ Completed: ${title}`;
    const text = isSubtask
      ? `✓ Completed subtask: ${(parentTask?.title ?? "Parent task")} → ${title}`
      : `✓ Completed task: ${title}`;
    const eventId = isSubtask ? `subtask:completed:${taskId}` : `task:completed:${taskId}`;
    const eventKind: DayLogEvent["kind"] = isSubtask ? "SUBTASK" : "TASK";
    const fallbackAt =
      task?.completedAt && task.completedAt.slice(0, 10) === date
        ? task.completedAt
        : day.endedAt ?? localTimestampForDate(date, 23, 59, 59);
    derivedEvents.push({
      id: eventId,
      at: getTaskCompletionEventTimestamp(
        day,
        eventId,
        eventKind,
        text,
        fallbackAt,
        isSubtask ? `task:completed:${taskId}` : undefined,
        legacyText
      ),
      kind: eventKind,
      text,
    });
  });

  state.meetings
    .filter((meeting) => meeting.date === date && meeting.attended && !meeting.skipped)
    .forEach((meeting) => {
      const text = `✓ Attended: ${meeting.title}`;
      const fallbackAt = meetingStartTimestamp(date, meeting.time) ?? day.startedAt ?? localTimestampForDate(date, 12, 0, 0);
      derivedEvents.push({
        id: `meeting:attended:${meeting.id}`,
        at: getEventTimestamp(day, `meeting:attended:${meeting.id}`, "MEETING", text, fallbackAt),
        kind: "MEETING",
        text,
      });
    });

  state.sessions
    .filter((session) => session.date === date && !!session.startedAt)
    .forEach((session) => {
      const templateTitle = templateTitleById.get(session.templateId) ?? "Focus session";
      derivedEvents.push({
        id: `focus:started:${session.id}`,
        at: session.startedAt,
        kind: "FOCUS",
        text: `▶ Started: ${templateTitle}`,
      });
      if (session.endedAt) {
        const minutes = session.actualMinutes ?? Math.max(0, Math.round((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 60000));
        derivedEvents.push({
          id: `focus:ended:${session.id}`,
          at: session.endedAt,
          kind: "FOCUS",
          text: `■ Ended: ${templateTitle} (${minutes}m)`,
        });
      }
    });

  return derivedEvents.sort((a, b) => a.at.localeCompare(b.at) || a.kind.localeCompare(b.kind) || a.text.localeCompare(b.text));
}

// v4: Meeting management functions

function parseDateParts(date: DateISO): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function toDateISO(year: number, month: number, day: number): DateISO {
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}` as DateISO;
}

function addDaysISO(date: DateISO, days: number): DateISO {
  const { year, month, day } = parseDateParts(date);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return toDateISO(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function addMonthsISO(date: DateISO, months: number): DateISO {
  const { year, month, day } = parseDateParts(date);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const targetMonth = normalizedMonth + 1;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);
  return toDateISO(targetYear, targetMonth, clampedDay);
}

function listRecurringDates(startDate: DateISO, recurrence: MeetingRecurrence, horizonMonths: number): DateISO[] {
  if (recurrence === "NONE") return [startDate];
  const horizonDate = addMonthsISO(startDate, horizonMonths);
  const dates: DateISO[] = [startDate];
  let current = startDate;
  while (true) {
    current =
      recurrence === "MONTHLY"
        ? addMonthsISO(current, 1)
        : addDaysISO(current, recurrence === "WEEKLY" ? 7 : 14);
    if (current > horizonDate) break;
    dates.push(current);
  }
  return dates;
}

function normalizeMeetingRecurrence(recurrence: MeetingEntry["recurrence"]): MeetingRecurrence {
  return recurrence ?? "NONE";
}

function buildRecurringMeetings(
  meeting: MeetingEntry,
  horizonMonths: number,
  existingByDate?: Map<DateISO, MeetingEntry>
): MeetingEntry[] {
  const recurrence = normalizeMeetingRecurrence(meeting.recurrence);

  if (recurrence === "NONE") {
    return [
      {
        ...meeting,
        ym: ymFromDate(meeting.date),
        recurrence: undefined,
        seriesId: undefined,
      },
    ];
  }

  const seriesId = meeting.seriesId ?? makeId("meeting_series");
  const dates = listRecurringDates(meeting.date, recurrence, horizonMonths);

  return dates.map((date, index) => {
    const existing = existingByDate?.get(date);
    return {
      ...meeting,
      id: existing?.id ?? (index === 0 ? meeting.id : makeId("meeting")),
      date,
      ym: ymFromDate(date),
      createdAt: existing?.createdAt ?? meeting.createdAt,
      recurrence,
      seriesId,
      attended: existing?.attended,
      skipped: existing?.skipped,
    };
  });
}

export function addMeeting(state: AppStateV0, meeting: MeetingEntry): AppStateV0 {
  return { ...state, meetings: [meeting, ...state.meetings] };
}

export function addMeetingWithRecurrence(
  state: AppStateV0,
  meeting: MeetingEntry,
  horizonMonths = 12
): AppStateV0 {
  const recurrence = normalizeMeetingRecurrence(meeting.recurrence);
  if (recurrence === "NONE") {
    return addMeeting(state, {
      ...meeting,
      ym: ymFromDate(meeting.date),
      recurrence: undefined,
      seriesId: undefined,
    });
  }
  const meetings = buildRecurringMeetings(
    {
      ...meeting,
      recurrence,
      seriesId: meeting.seriesId ?? makeId("meeting_series"),
    },
    horizonMonths
  );
  return { ...state, meetings: [...meetings, ...state.meetings] };
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

export function updateMeetingThisAndFuture(
  state: AppStateV0,
  meetingId: string,
  updates: Partial<Omit<MeetingEntry, "id" | "createdAt">>,
  horizonMonths = 12
): AppStateV0 {
  const targetMeeting = state.meetings.find((m) => m.id === meetingId);
  if (!targetMeeting?.seriesId) {
    return updateMeeting(state, meetingId, updates);
  }

  const seriesId = targetMeeting.seriesId;
  const remainingMeetings = state.meetings.filter(
    (m) => !(m.seriesId === seriesId && m.date >= targetMeeting.date)
  );
  const preservedFutureByDate = new Map<DateISO, MeetingEntry>(
    state.meetings
      .filter((m) => m.seriesId === seriesId && m.date >= targetMeeting.date)
      .map((m) => [m.date, m])
  );

  const mergedMeeting: MeetingEntry = {
    ...targetMeeting,
    ...updates,
    ym: ymFromDate((updates.date ?? targetMeeting.date) as DateISO),
    seriesId,
  };
  const recurrence = normalizeMeetingRecurrence(mergedMeeting.recurrence);

  if (recurrence === "NONE") {
    return {
      ...state,
      meetings: [
        {
          ...mergedMeeting,
          recurrence: undefined,
          seriesId: undefined,
        },
        ...remainingMeetings,
      ],
    };
  }

  const regeneratedMeetings = buildRecurringMeetings(
    {
      ...mergedMeeting,
      recurrence,
      seriesId,
    },
    horizonMonths,
    preservedFutureByDate
  );

  return {
    ...state,
    meetings: [...regeneratedMeetings, ...remainingMeetings],
  };
}

export function deleteMeetingThisAndFuture(state: AppStateV0, meetingId: string): AppStateV0 {
  const targetMeeting = state.meetings.find((m) => m.id === meetingId);
  if (!targetMeeting?.seriesId) {
    return deleteMeeting(state, meetingId);
  }

  return {
    ...state,
    meetings: state.meetings.filter(
      (m) => !(m.seriesId === targetMeeting.seriesId && m.date >= targetMeeting.date)
    ),
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

export function setMeetingSkipped(state: AppStateV0, meetingId: string, skipped: boolean): AppStateV0 {
  return {
    ...state,
    meetings: state.meetings.map((m) =>
      m.id === meetingId ? { ...m, skipped, attended: skipped ? false : m.attended } : m
    ),
  };
}

export function setFocusTemplateOverrideForDay(
  state: AppStateV0,
  date: DateISO,
  templateId: string,
  override: { plannedStart: string; plannedEnd: string }
): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  const nextMap = { ...(day.focusTemplateOverridesById ?? {}) };
  nextMap[templateId] = override;
  return updateDay(withDay, { ...day, focusTemplateOverridesById: nextMap });
}

export function clearFocusTemplateOverrideForDay(
  state: AppStateV0,
  date: DateISO,
  templateId: string
): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  if (!day.focusTemplateOverridesById) return withDay;
  const nextMap = { ...day.focusTemplateOverridesById };
  delete nextMap[templateId];
  return updateDay(withDay, { ...day, focusTemplateOverridesById: nextMap });
}

export function toggleFocusTemplateSkippedForDay(
  state: AppStateV0,
  date: DateISO,
  templateId: string
): AppStateV0 {
  const ym = ymFromDate(date);
  const { state: withDay, day } = getOrCreateDay(state, date, ym);
  const current = new Set(day.skippedFocusTemplateIds ?? []);
  if (current.has(templateId)) {
    current.delete(templateId);
  } else {
    current.add(templateId);
  }
  return updateDay(withDay, { ...day, skippedFocusTemplateIds: Array.from(current) });
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
  const now = getVirtualTimestamp();
  const grandPlan: GrandPlan = {
    id: makeId("gp"),
    title,
    startMonth,
    endMonth,
    isClosed: false,
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
  const now = getVirtualTimestamp();

  // Create example categories
  const catPapers: Category = {
    id: makeId("cat"),
    title: "Papers",
    color: "#2196f3",
    order: 1,
    createdAt: now,
  };

  const catFuture: Category = {
    id: makeId("cat"),
    title: "Future",
    color: "#4caf50",
    order: 2,
    createdAt: now,
  };

  // Papers tree A (3 milestones total, goal at bottom)
  const papersAGoal: MilestoneNode = {
    id: makeId("ms"),
    categoryId: catPapers.id,
    parentId: null,
    title: "Submit paper to arXiv",
    description: "Finalize and upload the analysis paper",
    status: "NOT_STARTED",
    order: 1,
    createdAt: now,
  };

  const papersA2: MilestoneNode = {
    id: makeId("ms"),
    categoryId: catPapers.id,
    parentId: papersAGoal.id,
    title: "Internal review & feedback",
    description: "Share draft with the group and iterate",
    status: "NOT_STARTED",
    order: 1,
    createdAt: now,
  };

  const papersA1: MilestoneNode = {
    id: makeId("ms"),
    categoryId: catPapers.id,
    parentId: papersA2.id,
    title: "Draft analysis note",
    description: "Summarize dataset, selection, and key plots",
    status: "NOT_STARTED",
    order: 1,
    createdAt: now,
  };

  // Papers tree B (2 milestones total, goal at bottom)
  const papersBGoal: MilestoneNode = {
    id: makeId("ms"),
    categoryId: catPapers.id,
    parentId: null,
    title: "Complete methods appendix",
    description: "Finalize detector + systematics write‑up",
    status: "NOT_STARTED",
    order: 2,
    createdAt: now,
  };

  const papersB1: MilestoneNode = {
    id: makeId("ms"),
    categoryId: catPapers.id,
    parentId: papersBGoal.id,
    title: "Literature review: detector performance",
    description: "Collect references and key plots",
    status: "NOT_STARTED",
    order: 1,
    createdAt: now,
  };

  // Future category (job search, goal at bottom)
  const futureGoal: MilestoneNode = {
    id: makeId("ms"),
    categoryId: catFuture.id,
    parentId: null,
    title: "Secure a particle physics role",
    description: "Accept an offer for a research position",
    status: "NOT_STARTED",
    order: 1,
    createdAt: now,
  };

  const futureMs2: MilestoneNode = {
    id: makeId("ms"),
    categoryId: catFuture.id,
    parentId: futureGoal.id,
    title: "Prepare application kit",
    description: "CV, research statement, and references",
    status: "NOT_STARTED",
    order: 1,
    createdAt: now,
  };

  const futureMs1: MilestoneNode = {
    id: makeId("ms"),
    categoryId: catFuture.id,
    parentId: futureMs2.id,
    title: "Define target roles",
    description: "Identify labs, collaborations, and openings",
    status: "NOT_STARTED",
    order: 1,
    createdAt: now,
  };

  const grandPlan: GrandPlan = {
    id: makeId("gp"),
    title,
    startMonth,
    endMonth,
    isClosed: false,
    categories: [catPapers, catFuture],
    milestones: [papersA1, papersA2, papersAGoal, papersB1, papersBGoal, futureMs1, futureMs2, futureGoal],
    createdAt: now,
    updatedAt: now,
  };

  return { ...state, grandPlan };
}

// v11: Close/Reopen grand plan functionality
export function closeGrandPlan(state: AppStateV0): AppStateV0 {
  if (!state.grandPlan) return state;
  const now = getVirtualTimestamp();
  const currentYM = now.slice(0, 7) as YM;
  const endMonth = currentYM < state.grandPlan.startMonth ? state.grandPlan.startMonth : currentYM;

  let next = state;

  // Close today's day (if open)
  const today = getTodayDate();
  const day0 = next.days[today];
  if (day0 && !day0.isClosed && (day0.isWorkingDay === true || !!day0.activeSessionId)) {
    next = closeDay(next, today);
  }

  // Close current month (if it exists)
  next = closeMonth(next, currentYM);

  return {
    ...next,
    grandPlan: {
      ...state.grandPlan,
      isClosed: true,
      closedAt: now,
      endMonth,
      updatedAt: now,
    },
  };
}

export function reopenGrandPlan(state: AppStateV0): AppStateV0 {
  if (!state.grandPlan) return state;
  const now = getVirtualTimestamp();
  return {
    ...state,
    grandPlan: {
      ...state.grandPlan,
      isClosed: false,
      closedAt: undefined,
      updatedAt: now,
    },
  };
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
      updatedAt: getVirtualTimestamp(),
    },
  };
}

export function deleteGrandPlan(state: AppStateV0): AppStateV0 {
  const milestoneIds = new Set(state.grandPlan?.milestones.map((milestone) => milestone.id) ?? []);
  const cleanedMonths: Record<string, MonthPlan> = {};
  for (const [ym, plan] of Object.entries(state.months)) {
    cleanedMonths[ym] = {
      ...plan,
      templates: plan.templates.map((template) => ({ ...template, linkedMilestoneId: null })),
      pinnedMilestoneIds: [],
      primaryMilestoneId: undefined,
    };
  }

  const cleanedDays: Record<string, DayEntry> = {};
  for (const [date, day] of Object.entries(state.days)) {
    if (!day.focusMilestoneByTemplateId) {
      cleanedDays[date] = day;
      continue;
    }
    cleanedDays[date] = { ...day, focusMilestoneByTemplateId: undefined };
  }

  return {
    ...state,
    grandPlan: undefined,
    months: cleanedMonths,
    taskArchive: moveMilestoneTasksToStandalone(getTaskArchive(state), milestoneIds),
    days: cleanedDays,
  };
}

function moveMilestoneTasksToStandalone(archive: TaskArchive, milestoneIds: Set<string>): TaskArchive {
  if (milestoneIds.size === 0) return archive;

  const nextStandaloneById = new Map(archive.standaloneTasks.map((task) => [task.id, task] as const));
  const nextTasksByMilestoneId = { ...archive.tasksByMilestoneId };
  const nextBoardByScope = { ...archive.boardByScope };
  const nextTaskLinksByScope = { ...archive.taskLinksByScope };

  milestoneIds.forEach((milestoneId) => {
    (archive.tasksByMilestoneId[milestoneId] ?? []).forEach((task) => {
      nextStandaloneById.set(task.id, { ...task, linkedMilestoneId: undefined });
    });
    delete nextTasksByMilestoneId[milestoneId];
    delete nextBoardByScope[getTaskScopeKey(milestoneId)];
    delete nextTaskLinksByScope[getTaskScopeKey(milestoneId)];
  });

  return {
    ...archive,
    standaloneTasks: Array.from(nextStandaloneById.values()),
    tasksByMilestoneId: nextTasksByMilestoneId,
    boardByScope: nextBoardByScope,
    taskLinksByScope: nextTaskLinksByScope,
  };
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
    createdAt: getVirtualTimestamp(),
  };
  return {
    ...state,
    grandPlan: {
      ...state.grandPlan,
      categories: [...state.grandPlan.categories, category],
      updatedAt: getVirtualTimestamp(),
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
      updatedAt: getVirtualTimestamp(),
    },
  };
}

export function deleteCategory(state: AppStateV0, categoryId: string): AppStateV0 {
  if (!state.grandPlan) return state;

  // Delete all milestones in this category
  const milestoneIds = new Set(
    state.grandPlan.milestones.filter((m) => m.categoryId === categoryId).map((m) => m.id)
  );

  const cleanedMonths: Record<string, MonthPlan> = {};
  for (const [ym, plan] of Object.entries(state.months)) {
    const cleanedTemplates = plan.templates.map((t) => {
      if (t.linkedMilestoneId && milestoneIds.has(t.linkedMilestoneId)) {
        return { ...t, linkedMilestoneId: null };
      }
      return t;
    });
    const nextPinned = (plan.pinnedMilestoneIds ?? []).filter((id) => !milestoneIds.has(id));
    const nextPrimary = plan.primaryMilestoneId && nextPinned.includes(plan.primaryMilestoneId)
      ? plan.primaryMilestoneId
      : nextPinned[0];
    cleanedMonths[ym] = {
      ...plan,
      templates: cleanedTemplates,
      pinnedMilestoneIds: nextPinned,
      primaryMilestoneId: nextPrimary,
    };
  }

  const cleanedDays: Record<string, DayEntry> = {};
  for (const [date, day] of Object.entries(state.days)) {
    const prev = day.focusMilestoneByTemplateId;
    if (!prev) {
      cleanedDays[date] = day;
      continue;
    }
    const nextMap: Record<string, string> = {};
    for (const [templateId, milestoneId] of Object.entries(prev)) {
      if (!milestoneIds.has(milestoneId)) nextMap[templateId] = milestoneId;
    }
    cleanedDays[date] = { ...day, focusMilestoneByTemplateId: Object.keys(nextMap).length > 0 ? nextMap : undefined };
  }

  return {
    ...state,
    months: cleanedMonths,
    taskArchive: moveMilestoneTasksToStandalone(getTaskArchive(state), milestoneIds),
    days: cleanedDays,
    grandPlan: {
      ...state.grandPlan,
      categories: state.grandPlan.categories.filter((c) => c.id !== categoryId),
      milestones: state.grandPlan.milestones.filter((m) => m.categoryId !== categoryId),
      updatedAt: getVirtualTimestamp(),
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
      updatedAt: getVirtualTimestamp(),
    },
  };
}

// Milestone CRUD

export function addMilestone(
  state: AppStateV0,
  categoryId: string,
  title: string,
  parentId: string | null,
  description?: string
): AppStateV0 {
  if (!state.grandPlan) return state;

  const siblings = state.grandPlan.milestones.filter(
    (m) => m.categoryId === categoryId && m.parentId === parentId
  );
  const hasExistingChildren = parentId !== null && siblings.length > 0;
  const maxOrder = Math.max(0, ...siblings.map((m) => m.order));

  const milestone: MilestoneNode = {
    id: makeId("ms"),
    categoryId,
    parentId,
    title,
    description: description?.trim() || undefined,
    status: "NOT_STARTED",
    order: maxOrder + 1,
    createdAt: getVirtualTimestamp(),
  };

  return {
    ...state,
    grandPlan: {
      ...state.grandPlan,
      milestones: hasExistingChildren
        ? [
            ...state.grandPlan.milestones.map((m) => {
              if (m.categoryId !== categoryId || m.parentId !== parentId) return m;
              return { ...m, parentId: milestone.id };
            }),
            milestone,
          ]
        : [...state.grandPlan.milestones, milestone],
      updatedAt: getVirtualTimestamp(),
    },
  };
}

export function updateMilestone(
  state: AppStateV0,
  milestoneId: string,
  updates: Partial<Pick<MilestoneNode, "title" | "treeName" | "description" | "status" | "parentId">>
): AppStateV0 {
  if (!state.grandPlan) return state;
  const now = getVirtualTimestamp();
  return {
    ...state,
    grandPlan: {
      ...state.grandPlan,
      milestones: state.grandPlan.milestones.map((m) =>
        m.id === milestoneId
          ? {
              ...m,
              ...updates,
              completedAt:
                updates.status === undefined
                  ? m.completedAt
                  : updates.status === "COMPLETED"
                    ? m.completedAt ?? now
                    : undefined,
            }
          : m
      ),
      updatedAt: getVirtualTimestamp(),
    },
  };
}

export function deleteMilestone(state: AppStateV0, milestoneId: string, cascadeChildren: boolean = true): AppStateV0 {
  if (!state.grandPlan) return state;

  const deleted = state.grandPlan.milestones.find((m) => m.id === milestoneId);
  if (!deleted) return state;

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

  const children = cascadeChildren
    ? []
    : state.grandPlan.milestones
        .filter((m) => m.parentId === milestoneId)
        .sort((a, b) => a.order - b.order);
  const promotedId = children.length > 0 ? children[0].id : null;

  const cleanedMonths: Record<string, MonthPlan> = {};
  for (const [ym, plan] of Object.entries(state.months)) {
    const cleanedTemplates = plan.templates.map((t) => {
      if (t.linkedMilestoneId && toDelete.has(t.linkedMilestoneId)) {
        return { ...t, linkedMilestoneId: null };
      }
      return t;
    });
    const nextPinned = (plan.pinnedMilestoneIds ?? []).filter((id) => !toDelete.has(id));
    const nextPrimary = plan.primaryMilestoneId && nextPinned.includes(plan.primaryMilestoneId)
      ? plan.primaryMilestoneId
      : nextPinned[0];
    cleanedMonths[ym] = {
      ...plan,
      templates: cleanedTemplates,
      pinnedMilestoneIds: nextPinned,
      primaryMilestoneId: nextPrimary,
    };
  }

  const cleanedDays: Record<string, DayEntry> = {};
  for (const [date, day] of Object.entries(state.days)) {
    const prev = day.focusMilestoneByTemplateId;
    if (!prev) {
      cleanedDays[date] = day;
      continue;
    }
    const nextMap: Record<string, string> = {};
    for (const [templateId, msId] of Object.entries(prev)) {
      if (!toDelete.has(msId)) nextMap[templateId] = msId;
    }
    cleanedDays[date] = { ...day, focusMilestoneByTemplateId: Object.keys(nextMap).length > 0 ? nextMap : undefined };
  }

  return {
    ...state,
    months: cleanedMonths,
    taskArchive: moveMilestoneTasksToStandalone(getTaskArchive(state), toDelete),
    days: cleanedDays,
    grandPlan: {
      ...state.grandPlan,
      milestones: state.grandPlan.milestones
        .filter((m) => !toDelete.has(m.id))
        .map((m) => {
          if (cascadeChildren) return m;
          if (m.parentId !== milestoneId) return m;
          if (!promotedId) return m;
          if (m.id === promotedId) {
            return {
              ...m,
              parentId: deleted.parentId,
              order: deleted.order,
              treeName: deleted.parentId === null ? deleted.treeName : m.treeName,
            };
          }
          return { ...m, parentId: promotedId };
        }),
      updatedAt: getVirtualTimestamp(),
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
      updatedAt: getVirtualTimestamp(),
    },
  };
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

  return orderedIds.map((id) => byId.get(id)!).filter(Boolean);
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
    return { allowed: false, reason: "Create a Grand Plan first" };
  }
  if (state.grandPlan.isClosed) {
    return { allowed: false, reason: "Your Grand Plan is closed (report mode). Reopen it to create new months." };
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
