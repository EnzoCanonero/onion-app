import type { DateISO, GrandPlan, YM } from "./types";

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

export function getCategoryMeta(grandPlan: GrandPlan | undefined, milestoneId: string | null | undefined): CategoryMeta {
  if (!milestoneId) return UNCATEGORIZED_CATEGORY;
  if (!grandPlan) return UNCATEGORIZED_CATEGORY;

  const milestone = grandPlan.milestones.find((m) => m.id === milestoneId);
  if (!milestone) return UNKNOWN_CATEGORY;

  const category = grandPlan.categories.find((c) => c.id === milestone.categoryId);
  if (!category) return UNKNOWN_CATEGORY;

  return { id: category.id, title: category.title, color: category.color };
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
