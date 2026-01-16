import type { DateISO, Weekday } from "./types";

export const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

export const MON_FRI: Weekday[] = [1, 2, 3, 4, 5];
export const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export function sortWeekdays(days: readonly Weekday[]): Weekday[] {
  const index = new Map<Weekday, number>(WEEKDAY_ORDER.map((d, i) => [d, i]));
  return [...days].sort((a, b) => (index.get(a) ?? 99) - (index.get(b) ?? 99));
}

export function normalizeWeekdays(input: unknown): Weekday[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const seen = new Set<number>();
  const cleaned: Weekday[] = [];
  for (const value of input) {
    if (typeof value !== "number") continue;
    if (value < 0 || value > 6) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    cleaned.push(value as Weekday);
  }
  return sortWeekdays(cleaned);
}

export function isTemplateScheduledForWeekday(daysOfWeek: readonly Weekday[] | undefined, weekday: Weekday | null): boolean {
  if (weekday === null) return true;
  if (!daysOfWeek || daysOfWeek.length === 0) return true;
  return daysOfWeek.includes(weekday);
}

export function isSameWeekdaySet(a: readonly Weekday[] | undefined, b: readonly Weekday[] | undefined): boolean {
  const aSorted = a ? sortWeekdays(a) : [];
  const bSorted = b ? sortWeekdays(b) : [];
  if (aSorted.length !== bSorted.length) return false;
  return aSorted.every((day, idx) => day === bSorted[idx]);
}

export function formatWeekdays(daysOfWeek: readonly Weekday[] | undefined): string {
  if (!daysOfWeek || daysOfWeek.length === 0) return "Any day";
  if (isSameWeekdaySet(daysOfWeek, MON_FRI)) return "Mon–Fri";
  if (isSameWeekdaySet(daysOfWeek, ALL_DAYS)) return "Every day";
  return sortWeekdays(daysOfWeek).map((d) => WEEKDAY_SHORT[d]).join(", ");
}

export function dayOfWeekFromDateISO(date: DateISO): Weekday | null {
  const parts = date.split("-").map((x) => Number(x));
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return new Date(year, month - 1, day).getDay() as Weekday;
}

