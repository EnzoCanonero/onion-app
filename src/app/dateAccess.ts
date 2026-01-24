import type { AppStateV0, DateISO, YM } from "./types";
import { getTodayDate, getCurrentYM, getMonth } from "./storage";

export type DateAccessResult =
  | { allowed: true }
  | { allowed: false; reason: "future"; meetingsAllowed: true }
  | { allowed: false; reason: "past_unactivated_day"; meetingsAllowed: false }
  | { allowed: false; reason: "past_unactivated_month"; meetingsAllowed: false };

export type MonthAccessResult =
  | { allowed: true; canActivate: boolean }
  | { allowed: false; canActivate: false; reason: "future" }
  | { allowed: false; canActivate: false; reason: "past_unactivated" };

/**
 * Check if a specific date can be accessed.
 * Uses virtual time in developer mode, so restrictions still apply
 * but based on the virtual "today".
 *
 * Navigation is always allowed - the page will show appropriate "nothing to see" panels.
 * Only future dates block navigation (but allow meetings).
 */
export function checkDateAccess(
  _state: AppStateV0,
  date: DateISO
): DateAccessResult {
  const today = getTodayDate(); // Uses virtual time in dev mode

  // Current day: always allowed
  if (date === today) {
    return { allowed: true };
  }

  // Future date: blocked for navigation, but meetings allowed
  if (date > today) {
    return { allowed: false, reason: "future", meetingsAllowed: true };
  }

  // Past dates: always allow navigation (page will show "nothing to see" if empty)
  return { allowed: true };
}

/**
 * Check if a specific month can be accessed.
 * Uses virtual time in developer mode, so restrictions still apply
 * but based on the virtual current month.
 *
 * Navigation is always allowed - the page will show appropriate "nothing to see" panels.
 * Future months block navigation; past months without a plan return "past_unactivated".
 */
export function checkMonthAccess(
  state: AppStateV0,
  ym: YM
): MonthAccessResult {
  const currentYM = getCurrentYM(); // Uses virtual time in dev mode

  // Current month: always allowed, can activate
  if (ym === currentYM) {
    return { allowed: true, canActivate: true };
  }

  // Future month: blocked
  if (ym > currentYM) {
    return { allowed: false, canActivate: false, reason: "future" };
  }

  // Past months: if never set up, show "nothing to see"
  if (!getMonth(state, ym)) {
    return { allowed: false, canActivate: false, reason: "past_unactivated" };
  }

  // Past months that were set up are viewable, but can't activate new things
  return { allowed: true, canActivate: false };
}

/**
 * Check if a day can be activated (Start Working Day button).
 * Only today (virtual today in dev mode) can be activated.
 */
export function canActivateDay(date: DateISO): boolean {
  return date === getTodayDate(); // Uses virtual time in dev mode
}
