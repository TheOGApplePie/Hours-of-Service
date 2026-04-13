import { RawStatus } from "@/types/rawStatus";
import { MtoViolation } from "@/types/dashboard";

// ── MTO Ontario Hours of Service limits ───────────────────────────────────────
const MAX_DAILY_DRIVING_MINS = 13 * 60; // 13h on-duty-driving per day
const MAX_DAILY_ON_DUTY_MINS = 16 * 60; // 16h NOT off-duty per day
const MAX_WEEKLY_ON_DUTY_MINS = 70 * 60; // 70h NOT off-duty in rolling 7 days
const REQUIRED_REST_MINS = 24 * 60; // 24h continuous off-duty block
const REST_CYCLE_DAYS = 15; // required at least once every 15 days
const MINS_PER_DAY = 24 * 60;

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
 * Only segments where the previous status was on-duty-driving are counted.
 * The final segment runs to end-of-day (23:59) if the last status is on-duty-driving,
 * representing a cross-midnight carry-over into the next day.
 */
export function calcDrivingMins(statuses: RawStatus[]): number {
  if (!statuses.length) return 0;

  let total = statuses.reduce((acc, current, i, arr) => {
    if (i === 0) return acc;
    const prev = arr[i - 1];
    if (prev.type !== "on-duty-driving") return acc;
    return acc + toMins(current.time_of_event) - toMins(prev.time_of_event);
  }, 0);

  // If the last status is on-duty-driving, count to end-of-day
  const last = statuses[statuses.length - 1];
  if (last.type === "on-duty-driving") {
    total += MINS_PER_DAY - toMins(last.time_of_event);
  }

  return total;
}

/**
 * Calculates total NOT-off-duty minutes (on-duty-driving + on-duty-not-driving)
 * from a sorted status array.
 * The final segment runs to end-of-day if the last status is any on-duty type,
 * representing a cross-midnight carry-over into the next day.
 */
export function calcOnDutyMins(statuses: RawStatus[]): number {
  if (!statuses.length) return 0;

  let total = statuses.reduce((acc, current, i, arr) => {
    if (i === 0) return acc;
    const prev = arr[i - 1];
    if (prev.type === "off-duty") return acc;
    return acc + toMins(current.time_of_event) - toMins(prev.time_of_event);
  }, 0);

  // If the last status is any on-duty type, count to end-of-day
  const last = statuses[statuses.length - 1];
  if (last.type !== "off-duty") {
    total += MINS_PER_DAY - toMins(last.time_of_event);
  }

  return total;
}

/**
 * Returns the number of off-duty minutes at the start of the day (lead-in)
 * before the first status event. If no statuses, the entire day is unknown —
 * returns 0 because a missing document is NOT treated as rest.
 */
function leadInMins(statuses: RawStatus[]): number {
  if (!statuses.length) return 0;
  return toMins(statuses[0].time_of_event);
}

/**
 * Returns the number of off-duty minutes at the end of the day (trail-out)
 * after the last status event. If the last status is on-duty, the driver
 * carried over into the next day — trail-out is 0.
 * If no statuses, returns 0 (missing document is not treated as rest).
 */
function trailOutMins(statuses: RawStatus[]): number {
  if (!statuses.length) return 0;
  const last = statuses[statuses.length - 1];
  if (last.type !== "off-duty") return 0;
  return MINS_PER_DAY - toMins(last.time_of_event);
}

/**
 * Checks whether a sorted status array for a single day contains a continuous
 * off-duty block of at least 24 hours within that day alone.
 *
 * A missing document (empty statuses) is NOT treated as a rest day — we have
 * no evidence the driver was actually off.
 *
 * Checks explicit off-duty segments between consecutive statuses, and the
 * implicit off-duty trail-out from the last status to end-of-day.
 *
 * A 24h block cannot fit within a single day's lead-in (max possible is
 * 23h 59m), so only segments and trail-out are evaluated.
 *
 * Cross-midnight blocks spanning two days are handled in checkRestRequirement.
 */
export function hasFullDayOff(statuses: RawStatus[]): boolean {
  // Missing document — we cannot confirm rest, so this does NOT count
  if (!statuses.length) return false;

  // Explicit off-duty segments within the day
  for (let i = 1; i < statuses.length; i++) {
    const prev = statuses[i - 1];
    if (prev.type === "off-duty") {
      const segMins =
        toMins(statuses[i].time_of_event) - toMins(prev.time_of_event);
      if (segMins >= REQUIRED_REST_MINS) return true;
    }
  }

  // Trail-out: last status → 24:00 (only if last status is off-duty)
  if (trailOutMins(statuses) >= REQUIRED_REST_MINS) return true;

  return false;
}

// ── Per-day violation checks ──────────────────────────────────────────────────

/**
 * Rule 1 — Daily driving limit: > 13h on-duty-driving.
 * Includes carry-over to end-of-day if the last status is on-duty-driving.
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
 * Includes carry-over to end-of-day if the last status is any on-duty type.
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
 * Accounts for cross-midnight carry-over: if day N ends with an on-duty status,
 * the carry-over minutes are already included in day N's calcOnDutyMins result
 * (which counts to end-of-day). To avoid double-counting, day N+1's lead-in
 * minutes (before the first status) are subtracted since they represent the
 * same continuous on-duty block that started on day N.
 *
 * @param docsByDate Map of ISO date string → sorted statuses.
 * @param sevenDayWindow Sorted array of 7 consecutive ISO date strings.
 */
export function checkWeeklyOnDuty(
  docsByDate: Map<string, RawStatus[]>,
  sevenDayWindow: string[],
): MtoViolation | null {
  let totalMins = 0;

  for (let i = 0; i < sevenDayWindow.length; i++) {
    const statuses = docsByDate.get(sevenDayWindow[i]) ?? [];
    totalMins += calcOnDutyMins(statuses);

    // Subtract the lead-in of the next day if the current day carried over,
    // because those minutes were already counted in the current day's trail-out.
    if (i < sevenDayWindow.length - 1) {
      const currentLast = statuses.length
        ? statuses[statuses.length - 1]
        : null;
      if (currentLast && currentLast.type !== "off-duty") {
        const nextStatuses = docsByDate.get(sevenDayWindow[i + 1]) ?? [];
        totalMins -= leadInMins(nextStatuses);
      }
    }
  }

  if (totalMins <= MAX_WEEKLY_ON_DUTY_MINS) return null;
  return {
    rule: "weekly_on_duty",
    detail: `${formatMins(totalMins)} on duty in 7 days (max 70h)`,
  };
}

/**
 * Rule 4 — 15-day rest requirement: at least one continuous 24h off-duty block
 * must occur within any rolling 15-day window.
 *
 * A missing document is NOT treated as rest — we have no evidence the driver
 * was off. Only submitted documents with confirmed off-duty periods count.
 *
 * We make a single pass across all days in the window, accumulating the length
 * of the current continuous off-duty block. The block resets to zero whenever
 * on-duty activity is encountered. This correctly handles rest blocks that span
 * more than two consecutive days (e.g. trail-out of day N + full missing day +
 * lead-in of day N+2 would be missed by a simple adjacent-pair check).
 *
 * @param docsByDate Map of ISO date string → sorted statuses.
 * @param fifteenDayWindow Sorted array of up to 15 consecutive ISO date strings.
 */
export function checkRestRequirement(
  docsByDate: Map<string, RawStatus[]>,
  fifteenDayWindow: string[],
): MtoViolation | null {
  let continuousOffDutyMins = 0;

  for (const date of fifteenDayWindow) {
    const statuses = docsByDate.get(date) ?? [];

    if (!statuses.length) {
      // Missing document — unknown, cannot count as rest; reset the block
      continuousOffDutyMins = 0;
      continue;
    }

    // Add the lead-in (00:00 → first status) only if it continues from the
    // previous day's off-duty trail-out (i.e. the block is already running)
    const lead = leadInMins(statuses);
    if (continuousOffDutyMins > 0) {
      continuousOffDutyMins += lead;
      if (continuousOffDutyMins >= REQUIRED_REST_MINS) return null;
    }

    // Walk through each segment of the day
    for (let i = 1; i < statuses.length; i++) {
      const prev = statuses[i - 1];
      const segMins =
        toMins(statuses[i].time_of_event) - toMins(prev.time_of_event);

      if (prev.type === "off-duty") {
        continuousOffDutyMins += segMins;
        if (continuousOffDutyMins >= REQUIRED_REST_MINS) return null;
      } else {
        // On-duty segment — break the off-duty block
        continuousOffDutyMins = 0;
      }
    }

    // Trail-out: last status → 24:00
    const trail = trailOutMins(statuses);
    if (trail > 0) {
      // Last status is off-duty — start or continue an off-duty block
      continuousOffDutyMins += trail;
      if (continuousOffDutyMins >= REQUIRED_REST_MINS) return null;
    } else {
      // Last status is on-duty (carry-over) — break the off-duty block
      continuousOffDutyMins = 0;
    }
  }

  return {
    rule: "rest_15_day",
    detail: `No 24h rest period found in the past ${REST_CYCLE_DAYS} days`,
  };
}
