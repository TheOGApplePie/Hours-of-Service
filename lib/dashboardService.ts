import { hosRepository } from "@/lib/firebase/index";
import { Driver } from "./driverService";
import { DashboardMetrics, MetricDriverDetail, MtoViolation } from "@/types/dashboard";
import { RawStatus } from "@/types/rawStatus";
import {
  checkDailyDriving,
  checkDailyOnDuty,
  checkWeeklyOnDuty,
  checkRestRequirement,
} from "./mtoCompliance";

/** Converts hours and minutes to a zero-padded HH:mm string. */
function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Converts a time_of_event object to total minutes since midnight. */
function toMinutes(time: { hour: number; minute: number }): number {
  return time.hour * 60 + time.minute;
}

/**
 * Formats a Date as a local-time ISO date string (yyyy-MM-dd).
 * Uses local-time getters instead of toISOString() to avoid UTC-offset
 * errors in timezones behind UTC (e.g. Ontario EDT = UTC-4), where
 * toISOString() can return the previous calendar day.
 */
function localDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Returns a new array of statuses sorted chronologically by time_of_event. */
function sortStatuses<T extends { time_of_event: { hour: number; minute: number } }>(
  statuses: T[],
): T[] {
  return [...statuses].sort(
    (a, b) => toMinutes(a.time_of_event) - toMinutes(b.time_of_event),
  );
}

/**
 * Returns today's date as an ISO string (yyyy-MM-dd) in local time.
 * Using local time avoids the UTC-offset issue where new Date().toISOString()
 * can return yesterday's date in timezones behind UTC.
 */
function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Returns ISO date strings for Mon–Sun of the current week. */
function getCurrentWeekDates(): string[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localDateISO(d);
  });
}

/** Returns ISO date strings for a rolling window of N days ending today. */
function getRollingDates(days: number): string[] {
  const now = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (days - 1 - i));
    return localDateISO(d);
  });
}

/**
 * Returns ISO date strings for the two-week workday window used for
 * missing HoS detection (Mon–Fri only, starting from last Monday).
 */
function getTwoWeekWorkdayDates(): string[] {
  const now = new Date();
  const startMonday = new Date(now);
  startMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7) - 7);
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(startMonday);
    d.setDate(startMonday.getDate() + i);
    return localDateISO(d);
  }).filter((dateStr) => {
    // Parse as local midnight — new Date("yyyy-MM-dd") is UTC midnight, which
    // shifts the day-of-week by -1 in UTC-negative timezones (e.g. Ontario EDT),
    // causing Mondays to be misidentified as Sundays and filtered out.
    const [y, m, d] = dateStr.split("-").map(Number);
    const day = new Date(y, m - 1, d).getDay();
    return day !== 0 && day !== 6;
  });
}

/**
 * Fetches and computes all four dashboard metrics for all active users.
 *
 * Violation checks follow MTO Ontario Hours of Service rules:
 *   - Daily: > 13h driving, > 16h on duty
 *   - Weekly: > 70h on duty in rolling 7 days
 *   - Rest: no 24h off-duty block in rolling 15 days
 *
 * Future dates are excluded from all checks — a day that hasn't happened
 * yet cannot have a missing submission or a violation.
 */
export async function fetchDashboardMetrics(
  drivers: Driver[],
): Promise<DashboardMetrics> {
  const activeUsers = drivers.filter((d) => d.is_active_driver !== false);
  const userIds = activeUsers.map((d) => d.id);

  if (!userIds.length) {
    return {
      earliestEventWeek: null,
      latestEventWeek: null,
      offendingDrivers: [],
      missingHoSDrivers: [],
    };
  }

  const today = todayISO();

  const weekDates = getCurrentWeekDates().filter((d) => d <= today);
  const rollingDates = getRollingDates(15).filter((d) => d <= today);
  const twoWeekWorkdays = getTwoWeekWorkdayDates().filter((d) => d <= today);

  const allQueryDatesSet = new Set([...weekDates, ...rollingDates, ...twoWeekWorkdays]);

  // Fetch all HoS docs for active drivers; date filtering applied below
  const rawDocs = await hosRepository.fetchForDrivers(userIds);

  // Index by driverId → date → sorted statuses
  const docsByDriverAndDate = new Map<string, Map<string, RawStatus[]>>();
  const submittedDatesByDriver = new Map<string, Set<string>>();

  for (const doc of rawDocs) {
    const { driver_id: driverId, date_of_document: date, statuses } = doc;
    if (!statuses?.length || !allQueryDatesSet.has(date)) continue;

    if (!docsByDriverAndDate.has(driverId)) docsByDriverAndDate.set(driverId, new Map());
    docsByDriverAndDate.get(driverId)!.set(date, sortStatuses(statuses as RawStatus[]));

    if (!submittedDatesByDriver.has(driverId)) submittedDatesByDriver.set(driverId, new Set());
    submittedDatesByDriver.get(driverId)!.add(date);
  }

  let earliestThisWeek: (MetricDriverDetail & { totalMins: number }) | null = null;
  let latestThisWeek: (MetricDriverDetail & { totalMins: number }) | null = null;
  const offendingDriverMap = new Map<string, MetricDriverDetail>();

  for (const user of activeUsers) {
    const docsByDate = docsByDriverAndDate.get(user.id) ?? new Map<string, RawStatus[]>();

    // ── Earliest / latest this week ──
    for (const date of weekDates) {
      const statuses = docsByDate.get(date);
      if (!statuses?.length) continue;

      const firstMins = toMinutes(statuses[0].time_of_event);
      const lastMins = toMinutes(statuses[statuses.length - 1].time_of_event);

      if (!earliestThisWeek || firstMins < earliestThisWeek.totalMins) {
        earliestThisWeek = {
          driverId: user.id,
          driverName: user.name,
          date,
          time: formatTime(statuses[0].time_of_event.hour, statuses[0].time_of_event.minute),
          statuses,
          totalMins: firstMins,
        };
      }
      if (!latestThisWeek || lastMins > latestThisWeek.totalMins) {
        latestThisWeek = {
          driverId: user.id,
          driverName: user.name,
          date,
          time: formatTime(
            statuses[statuses.length - 1].time_of_event.hour,
            statuses[statuses.length - 1].time_of_event.minute,
          ),
          statuses,
          totalMins: lastMins,
        };
      }
    }

    // ── MTO daily violations ──
    const dailyViolations: { date: string; violations: MtoViolation[] }[] = [];

    for (const date of rollingDates) {
      const statuses = docsByDate.get(date);
      if (!statuses?.length) continue;

      const dayViolations: MtoViolation[] = [];
      const v1 = checkDailyDriving(statuses);
      const v2 = checkDailyOnDuty(statuses);
      if (v1) dayViolations.push(v1);
      if (v2) dayViolations.push(v2);
      if (dayViolations.length) dailyViolations.push({ date, violations: dayViolations });
    }

    // ── MTO weekly on-duty violation ──
    const sevenDayWindow = rollingDates.slice(-7);
    const weeklyViolation = checkWeeklyOnDuty(docsByDate, sevenDayWindow);

    // ── MTO 15-day rest requirement ──
    const restViolation = checkRestRequirement(docsByDate, rollingDates);

    const allViolations: MtoViolation[] = [
      ...dailyViolations.flatMap((d) => d.violations),
      ...(weeklyViolation ? [weeklyViolation] : []),
      ...(restViolation ? [restViolation] : []),
    ];

    if (allViolations.length > 0) {
      const offendingDate =
        dailyViolations.length > 0
          ? dailyViolations[dailyViolations.length - 1].date
          : rollingDates[rollingDates.length - 1];

      offendingDriverMap.set(user.id, {
        driverId: user.id,
        driverName: user.name,
        date: offendingDate,
        statuses: docsByDate.get(offendingDate) ?? [],
        violations: allViolations,
      });
    }
  }

  // ── Missing HoS ─────────────────────────────────────────────────────────────
  const missingHoSDrivers: MetricDriverDetail[] = userIds
    .filter((id) => {
      const submitted = submittedDatesByDriver.get(id);
      return twoWeekWorkdays.some((d) => !submitted?.has(d));
    })
    .map((id) => {
      const user = activeUsers.find((d) => d.id === id)!;
      const submitted = submittedDatesByDriver.get(id);
      const missingDates = twoWeekWorkdays.filter((d) => !submitted?.has(d));
      return {
        driverId: id,
        driverName: user.name,
        date: missingDates[0],
        statuses: [],
        missingDates,
      };
    });

  const stripTotalMins = (
    detail: (MetricDriverDetail & { totalMins: number }) | null,
  ): MetricDriverDetail | null => {
    if (!detail) return null;
    const { totalMins: _, ...rest } = detail;
    return rest;
  };

  return {
    earliestEventWeek: stripTotalMins(earliestThisWeek),
    latestEventWeek: stripTotalMins(latestThisWeek),
    offendingDrivers: [...offendingDriverMap.values()],
    missingHoSDrivers,
  };
}
