import type { DateISO, GrandPlan, TaskNode, YM } from "./types";

export type CategoryMeta = {
  id: string;
  title: string;
  color: string;
};

export const UNCATEGORIZED_CATEGORY: CategoryMeta = {
  id: "uncategorized",
  title: "Uncategorized",
  color: "#94a3b8",
};

export const UNKNOWN_CATEGORY: CategoryMeta = {
  id: "unknown",
  title: "Unknown",
  color: "#94a3b8",
};

export type TaskGroupMeta = {
  groupKey: string;
  milestoneId?: string;
  milestoneTitle: string;
  categoryTitle: string;
  categoryColor: string;
  isStandalone: boolean;
};

export function getCategoryMeta(grandPlan: GrandPlan | undefined, milestoneId: string | null | undefined): CategoryMeta {
  if (!milestoneId) return UNCATEGORIZED_CATEGORY;
  if (!grandPlan) return UNCATEGORIZED_CATEGORY;

  const milestone = grandPlan.milestones.find((m) => m.id === milestoneId);
  if (!milestone) return UNKNOWN_CATEGORY;

  const category = grandPlan.categories.find((c) => c.id === milestone.categoryId);
  if (!category) return UNKNOWN_CATEGORY;

  return { id: category.id, title: category.title, color: category.color };
}

export function getColorHue(color: string): number {
  const normalized = color.trim();
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(normalized);
  if (!match) return Number.POSITIVE_INFINITY;

  let hex = match[1];
  if (hex.length === 3) hex = hex.split("").map((c) => `${c}${c}`).join("");
  const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;

  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;

  return ((hue * 60) + 360) % 360;
}

export function getTaskGroupMeta(grandPlan: GrandPlan | undefined, task: TaskNode): TaskGroupMeta {
  if (!task.linkedMilestoneId) {
    return {
      groupKey: "standalone",
      milestoneTitle: "Standalone tasks",
      categoryTitle: "Standalone",
      categoryColor: UNCATEGORIZED_CATEGORY.color,
      isStandalone: true,
    };
  }

  const milestone = grandPlan?.milestones.find((candidate) => candidate.id === task.linkedMilestoneId);
  if (!milestone) {
    return {
      groupKey: task.linkedMilestoneId,
      milestoneId: task.linkedMilestoneId,
      milestoneTitle: "Unknown milestone",
      categoryTitle: UNKNOWN_CATEGORY.title,
      categoryColor: UNKNOWN_CATEGORY.color,
      isStandalone: false,
    };
  }

  const category = grandPlan?.categories.find((candidate) => candidate.id === milestone.categoryId);
  return {
    groupKey: milestone.id,
    milestoneId: milestone.id,
    milestoneTitle: milestone.title,
    categoryTitle: category?.title ?? UNKNOWN_CATEGORY.title,
    categoryColor: category?.color ?? UNKNOWN_CATEGORY.color,
    isStandalone: false,
  };
}

export function compareTaskGroupMeta(a: TaskGroupMeta, b: TaskGroupMeta): number {
  if (a.isStandalone !== b.isStandalone) return a.isStandalone ? 1 : -1;

  const hueDiff = getColorHue(a.categoryColor) - getColorHue(b.categoryColor);
  if (hueDiff !== 0) return hueDiff;

  const categoryTitleDiff = a.categoryTitle.localeCompare(b.categoryTitle);
  if (categoryTitleDiff !== 0) return categoryTitleDiff;

  return a.milestoneTitle.localeCompare(b.milestoneTitle);
}

export function listDatesInMonth(ym: YM): DateISO[] {
  const [yStr, mStr] = ym.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return [];

  const daysInMonth = new Date(year, month, 0).getDate();
  const dates: DateISO[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dd = String(day).padStart(2, "0");
    dates.push(`${ym}-${dd}` as DateISO);
  }
  return dates;
}

export function listMonthsInRange(start: YM, end: YM): YM[] {
  const [syStr, smStr] = start.split("-");
  const [eyStr, emStr] = end.split("-");
  const sy = Number(syStr);
  const sm = Number(smStr);
  const ey = Number(eyStr);
  const em = Number(emStr);
  if (![sy, sm, ey, em].every(Number.isFinite)) return [];

  const out: YM[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const mm = String(m).padStart(2, "0");
    out.push(`${y}-${mm}` as YM);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function formatYMLabel(ym: YM, opts?: { withYear?: boolean }): string {
  const [yStr, mStr] = ym.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const withYear = opts?.withYear ?? true;
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return ym;

  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", withYear ? { month: "short", year: "2-digit" } : { month: "short" });
}

export function formatDateLabel(dateISO: DateISO, opts?: { withYear?: boolean }): string {
  const [yStr, mStr, dStr] = dateISO.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  const withYear = opts?.withYear ?? true;
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return dateISO;
  if (month < 1 || month > 12 || day < 1 || day > 31) return dateISO;
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(
    "en-US",
    withYear ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" }
  );
}
