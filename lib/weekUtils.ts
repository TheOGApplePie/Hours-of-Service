import {
  addDays,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  startOfMonth,
  endOfMonth,
  isSameMonth,
  isSameDay,
  isWithinInterval,
  addMonths,
} from "date-fns";

export const WEEK_START_DAY = 1 as const; // Monday

/** Snaps any date to the Monday of its week. */
export function snapToWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: WEEK_START_DAY });
}

/** Snaps any date to the Sunday of its week. */
export function snapToWeekEnd(date: Date): Date {
  return endOfWeek(date, { weekStartsOn: WEEK_START_DAY });
}

/**
 * Returns all ISO date strings (yyyy-MM-dd) between two dates inclusive.
 * startDate must be <= endDate.
 */
export function getDatesBetween(startDate: Date, endDate: Date): string[] {
  return eachDayOfInterval({ start: startDate, end: endDate }).map((d) =>
    format(d, "yyyy-MM-dd"),
  );
}

/** Returns the number of full weeks spanned by a Mon–Sun aligned range. */
export function countWeeks(startDate: Date, endDate: Date): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.round((endDate.getTime() - startDate.getTime() + 1) / msPerWeek);
}

/** Formats a week range as a readable label, e.g. "12 May – 18 May 2025". */
export function formatWeekRange(startDate: Date, endDate: Date): string {
  return `${format(startDate, "d MMM")} – ${format(endDate, "d MMM yyyy")}`;
}

/**
 * Builds a 6-row × 7-col grid of dates for a calendar month view.
 * Pads with days from adjacent months so the grid is always complete.
 */
export function buildCalendarGrid(month: Date): Date[] {
  const firstOfMonth = startOfMonth(month);
  const lastOfMonth = endOfMonth(month);
  const gridStart = snapToWeekStart(firstOfMonth);
  const gridEnd = snapToWeekEnd(lastOfMonth);
  return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

export { addMonths, isSameMonth, isSameDay, isWithinInterval, format };
