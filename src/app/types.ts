
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
  primaryTaskId?: string;
  secondaryTaskIds: string[];
  outcomeByTaskId: Record<string, "COMPLETED" | "NOT_COMPLETED">;
  shutdownNote?: { done: string; pending: string; nextStep: string };
  activeSessionId?: string; // enforces "one active running session"
};

export type AppStateV0 = {
  version: 0;
  months: Record<string, MonthPlan>;
  days: Record<string, DayEntry>;
  sessions: ProductivitySession[];
};
