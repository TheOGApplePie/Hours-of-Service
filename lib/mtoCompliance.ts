import { RawStatus } from "@/types/rawStatus";
import { MtoViolation } from "@/types/dashboard";

// ── MTO Ontario Hours of Service limits ───────────────────────────────────────
const MAX_DAILY_DRIVING_MINS = 13 * 60;       // 13h on-duty-driving per day
const MAX_DAILY_ON_DUTY_MINS = 16 * 60;       // 16h NOT off-duty per day
const MAX_WEEKLY_ON_DUTY_MINS = 70 * 60;      // 70h NOT off-duty in rolling 7 days
const REQUIRED_REST_MINS = 24 * 60;           // 24h continuous off-duty block
const REST_CYCLE_DAYS = 15;                   // required at least once every 15 days

/** Converts a time_of_event to total minutes since midnight. */
function toMins(time: { hour: number; minute: number }): number {
  return time.hour * 60 + time.minute;
}

/** Formats a minute count as "Xh Ym". */
export function formatMins(totalMins: number): string {
  return `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`;
}

/**
 * Calculates total on-duty-driving minutes from a sorted status array.
 * Only segments where the *previous* status was on-duty-driving are counted.
 */
export function calcDrivingMins(statuses: RawStatus[]): number {
  return statuses.reduce((total, current, i, arr) => {
    if (i === 0) return total;
    const prev = arr[i - 1];
    if (prev.type !== "on-duty-driving") return total;
    return total + toMins(current.time_of_event) - toMins(prev.time_of_event);
  }, 0);
}

/**
 * Calculates total NOT-off-duty minutes (on-duty-driving + on-duty-not-driving)
 * from a sorted status array.
 */
export function calcOnDutyMins(statuses: RawStatus[]): number {
  return statuses.reduce((total, current, i, arr) => {
    if (i === 0) return total;
    const prev = arr[i - 1];
    if (prev.type === "off-duty") return total;
    return total + toMins(current.time_of_event) - toMins(prev.time_of_event);
  }, 0);
}

/**
 * Checks whether a sorted status array contains a continuous off-duty block
 * of at least 24 hours.
 *
 * The block can span across midnight by treating the time before the first
 * status and after the last status as off-duty (the implicit off-duty periods
 * at the start and end of the day).
 *
 * For a single-day document we check:
 *   - Minutes from 00:00 to the first status (implicit off-duty lead-in)
 *   - Each explicit off-duty segment between consecutive statuses
 *   - Minutes from the last status to 24:00 (implicit off-duty trail-out)
 *
 * For the 15-day rest check we accumulate across consecutive days — see
 * checkRestRequirement below.
 */
export function hasFullDayOff(statuses: RawStatus[]): boolean {
  if (!statuses.length) {
    // No statuses submitted — treat the whole day as off-duty (24h)
    return true;
  }

  // Lead-in: 00:00 → first status
  const leadIn = toMins(statuses[0].time_of_event);
  if (leadIn >= REQUIRED_REST_MINS) return true;

  // Explicit off-duty segments
  for (let i = 1; i < statuses.length; i++) {
    const prev = statuses[i - 1];
    if (prev.type === "off-duty") {
      const segMins =
        toMins(statuses[i].time_of_event) - toMins(prev.time_of_event);
      if (segMins >= REQUIRED_REST_MINS) return true;
    }
  }

  // Trail-out: last status → 24:00
  const trailOut = 24 * 60 - toMins(statuses[statuses.length - 1].time_of_event);
  if (trailOut >= REQUIRED_REST_MINS) return true;

  return false;
}

// ── Per-day violation checks ──────────────────────────────────────────────────

/**
 * Rule 1 — Daily driving limit: > 13h on-duty-driving.
 */
export function checkDailyDriving(statuses: RawStatus[]): MtoViolation | null {
  const drivingMins = calcDrivingMins(statuses);
  if (drivingMins <= MAX_DAILY_DRIVING_MINS) return null;
  return {
    rule: "daily_driving",
    detail: `${formatMins(drivingMins)} driving (max 13h)`,
  };
}

/**
 * Rule 2 — Daily on-duty limit: > 16h NOT off-duty.
 */
export function checkDailyOnDuty(statuses: RawStatus[]): MtoViolation | null {
  const onDutyMins = calcOnDutyMins(statuses);
  if (onDutyMins <= MAX_DAILY_ON_DUTY_MINS) return null;
  return {
    rule: "daily_on_duty",
    detail: `${formatMins(onDutyMins)} on duty (max 16h)`,
  };
}

// ── Multi-day violation checks ────────────────────────────────────────────────

/**
 * Rule 3 — Rolling 7-day on-duty limit: > 70h NOT off-duty.
 *
 * @param docsByDate Map of ISO date string → sorted statuses for that day.
 *                   Must cover exactly 7 consecutive days ending on `endDate`.
 * @param endDate    The last day of the 7-day window (inclusive).
 */
export function checkWeeklyOnDuty(
  docsByDate: Map<string, RawStatus[]>,
  sevenDayWindow: string[],
): MtoViolation | null {
  const totalMins = sevenDayWindow.reduce((sum, date) => {
    const statuses = docsByDate.get(date) ?? [];
    return sum + calcOnDutyMins(statuses);
  }, 0);

  if (totalMins <= MAX_WEEKLY_ON_DUTY_MINS) return null;
  return {
    rule: "weekly_on_duty",
    detail: `${formatMins(totalMins)} on duty in 7 days (max 70h)`,
  };
}

/**
 * Rule 4 — 15-day rest requirement: at least one 24h off-duty block
 * must occur within any rolling 15-day window.
 *
 * We check the 15-day window ending on the most recent date in the dataset.
 * A day counts as a rest day if its statuses contain a 24h off-duty block,
 * OR if no document was submitted (treated as fully off-duty).
 *
 * Cross-midnight rest blocks (trail-out of day N + lead-in of day N+1) are
 * also checked by summing the trail-out of one day with the lead-in of the next.
 *
 * @param docsByDate Map of ISO date string → sorted statuses.
 * @param fifteenDayWindow Sorted array of 15 ISO date strings.
 */
export function checkRestRequirement(
  docsByDate: Map<string, RawStatus[]>,
  fifteenDayWindow: string[],
): MtoViolation | null {
  // Check single-day 24h blocks first
  for (const date of fifteenDayWindow) {
    const statuses = docsByDate.get(date) ?? [];
    if (hasFullDayOff(statuses)) return null;
  }

  // Check cross-midnight blocks: trail-out of day[i] + lead-in of day[i+1]
  for (let i = 0; i < fifteenDayWindow.length - 1; i++) {
    const todayStatuses = docsByDate.get(fifteenDayWindow[i]) ?? [];
    const tomorrowStatuses = docsByDate.get(fifteenDayWindow[i + 1]) ?? [];

    const trailOut = todayStatuses.length
      ? 24 * 60 - toMins(todayStatuses[todayStatuses.length - 1].time_of_event)
      : 24 * 60;

    const leadIn = tomorrowStatuses.length
      ? toMins(tomorrowStatuses[0].time_of_event)
      : 24 * 60;

    if (trailOut + leadIn >= REQUIRED_REST_MINS) return null;
  }

  return {
    rule: "rest_15_day",
    detail: `No 24h rest period found in the past ${REST_CYCLE_DAYS} days`,
  };
}
