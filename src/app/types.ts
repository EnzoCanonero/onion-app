
export type YM = `${number}-${string}`;      // e.g. "2025-12"
export type DateISO = `${number}-${string}-${string}`; // e.g. "2025-12-17"

export type TaskStatus = "NONE" | "YELLOW" | "GREEN";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DayLogEventKind = "SYSTEM" | "REMINDER" | "TASK" | "MEETING" | "FOCUS";

export type DayLogEvent = {
  id: string;
  at: string; // ISO timestamp
  kind: DayLogEventKind;
  text: string;
};

// v7: Daily reminders (editable quick checks)
export type DailyReminderTemplate = {
  id: string;
  text: string;
};

// v6: Grand Plan types
export type MilestoneStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type MilestoneNode = {
  id: string;
  categoryId: string;
  parentId: string | null;
  title: string;
  description?: string;
  status: MilestoneStatus;
  order: number;
  createdAt: string;
};

// v6.1: MilestoneDetail removed - tasks now have linkedMilestoneId instead

export type Category = {
  id: string;
  title: string;
  color: string;
  order: number;
  createdAt: string;
};

export type GrandPlan = {
  id: string;
  title: string;
  startMonth: YM;
  endMonth?: YM;
  categories: Category[];
  milestones: MilestoneNode[];
  createdAt: string;
  updatedAt: string;
};

export type TaskNode = {
  id: string;
  title: string;
  description?: string;
  notes?: string;
  boardX?: number;
  boardY?: number;
  boardW?: number;
  boardH?: number;
  parentId: string | null;
  status: TaskStatus;
  linkedMilestoneId?: string; // v6.1: optional link to a milestone
};

export type FocusTemplate = {
  id: string;
  title: string;
  plannedStart: string; // "HH:MM"
  plannedEnd: string;   // "HH:MM"
  daysOfWeek?: Weekday[]; // optional: when undefined/empty, available any day
  linkedMilestoneId?: string | null; // v6.3: null = standalone, undefined = legacy (treat as standalone)
  isSuspended?: boolean; // when true, hide from Daily (keeps past session data)
};

export type MonthPlan = {
  ym: YM;
  tasks: TaskNode[];
  templates: FocusTemplate[];
  pinnedMilestoneIds: string[]; // v8: explicit milestone pins shown in Month Setup
  createdAt: string; // ISO timestamp
  isClosed?: boolean; // v5: true if month is closed (read-only report mode)
  boardByScope?: Record<string, { width: number; height: number }>;
  taskLinksByScope?: Record<string, { from: string; to: string }[]>;
};

export type ProductivitySession = {
  id: string;
  date: DateISO;
  ym: YM;
  templateId: string;
  startedAt: string; // ISO timestamp
  endedAt?: string;  // ISO timestamp
  actualMinutes?: number;
};

export type DayEntry = {
  date: DateISO;
  ym: YM;
  isWorkingDay?: boolean; // v2: true if user activated this day as working day
  startedAt?: string; // v9: ISO timestamp when day was started
  isClosed?: boolean; // v4: true if user closed the day (read-only mode)
  endedAt?: string; // v9: ISO timestamp when day was closed
  events?: DayLogEvent[]; // v9: timeline events for the day
  emailChecked?: boolean; // v4: true if email was checked
  bureaucraticsCompleted?: boolean; // v4: true if bureaucratic tasks completed
  reminderCheckedById?: Record<string, boolean>; // v7: reminder template id -> checked
  primaryTaskId?: string;
  secondaryTaskIds: string[];
  outcomeByTaskId: Record<string, "COMPLETED" | "NOT_COMPLETED">;
  dailyJournal?: string; // v2: persistent daily notes
  pendingNote?: string; // v2: what's pending for next day
  shutdownNote?: string; // v2: end-of-day note shown next day
  activeSessionId?: string; // enforces "one active running session"
};

export type MeetingEntry = {
  id: string;
  date: DateISO;
  ym: YM;
  title: string;
  time: string; // "14:30" or "14:30-15:30"
  link?: string;
  description?: string;
  attended?: boolean; // v4: true if meeting was attended
  createdAt: string; // ISO timestamp
};

export type AppStateV0 = {
  version: 0;
  months: Record<string, MonthPlan>;
  days: Record<string, DayEntry>;
  sessions: ProductivitySession[];
  meetings: MeetingEntry[]; // v4: meeting entries
  grandPlan?: GrandPlan; // v6: single grand plan (optional)
  dailyReminderTemplates: DailyReminderTemplate[]; // v7: editable quick checks shown on Daily page
};
