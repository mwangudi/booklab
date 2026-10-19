/**
 * Rules for scheduled stock takes. Kept apart from the routes so the dashboard,
 * the stock take page and the completion check all agree on what "due" means.
 */

export type Frequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';
export type ScheduleStatus = 'scheduled' | 'due' | 'overdue' | 'off';

/** A count is "due" from this many days before its date, and can be completed then. */
export const DUE_WINDOW_DAYS = 7;

/**
 * Share of the products the branch holds stock of that a count must cover to count
 * as the full stock take. A one-line correction must not tick off the schedule.
 */
export const FULL_COUNT_SHARE = 0.9;

const DAY = 864e5;

/** Midnight at the start of the given day, server-local (Africa/Nairobi in production). */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** The same day one period later. A month that is too short takes its last day. */
export function addPeriod(d: Date, f: Frequency): Date {
  if (f === 'WEEKLY') return new Date(d.getTime() + 7 * DAY);
  const months = f === 'MONTHLY' ? 1 : 3;
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return target;
}

/** The next due date strictly after `doneAt`, stepping from the current due date. */
export function nextDueAfter(nextDue: Date, f: Frequency, doneAt: Date): Date {
  let d = addPeriod(nextDue, f);
  const after = startOfDay(doneAt);
  while (d <= after) d = addPeriod(d, f);
  return d;
}

export function scheduleStatus(s: { active: boolean; nextDue: Date } | null, now = new Date()): ScheduleStatus {
  if (!s || !s.active) return 'off';
  const due = startOfDay(s.nextDue);
  const today = startOfDay(now);
  if (today > due) return 'overdue';
  if (due.getTime() - today.getTime() <= DUE_WINDOW_DAYS * DAY) return 'due';
  return 'scheduled';
}

/** Whole days from today to the due date: negative when overdue. */
export function daysUntil(nextDue: Date, now = new Date()): number {
  return Math.round((startOfDay(nextDue).getTime() - startOfDay(now).getTime()) / DAY);
}
