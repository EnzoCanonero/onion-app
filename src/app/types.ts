
export type YM = `${number}-${string}`;      // e.g. "2025-12"
export type DateISO = `${number}-${string}-${string}`; // e.g. "2025-12-17"

export type TaskStatus = "NONE" | "YELLOW" | "GREEN";

export type TaskNode = {
  id: string;
  title: string;
  parentId: string | null;
  status: TaskStatus;
};

export type FocusTemplate = {
  id: string;
  title: string;
  plannedStart: string; // "HH:MM"
  plannedEnd: string;   // "HH:MM"
};

export type MonthPlan = {
  ym: YM;
  tasks: TaskNode[];
  templates: FocusTemplate[];
  initialSnapshotTaskIds: string[];
  createdAt: string; // ISO timestamp
  isClosed?: boolean; // v5: true if month is closed (read-only report mode)
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
  isClosed?: boolean; // v4: true if user closed the day (read-only mode)
  emailChecked?: boolean; // v4: true if email was checked
  bureaucraticsCompleted?: boolean; // v4: true if bureaucratic tasks completed
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
};
