import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { Driver } from "./driverService";
import { DashboardMetrics, MetricDriverDetail, MtoViolation } from "@/types/dashboard";
import { RawStatus } from "@/types/rawStatus";
import {
  checkDailyDriving,
  checkDailyOnDuty,
  checkWeeklyOnDuty,
  checkRestRequirement,
  calcOnDutyMins,
} from "./mtoCompliance";

const HOS_COLLECTION = "hours_of_service";

/** Converts hours and minutes to a zero-padded HH:mm string. */
function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Converts a time_of_event object to total minutes since midnight. */
function toMinutes(time: { hour: number; minute: number }): number {
  return time.hour * 60 + time.minute;
}

/** Returns a new array of statuses sorted chronologically by time_of_event. */
function sortStatuses<T extends { time_of_event: { hour: number; minute: number } }>(
  statuses: T[],
): T[] {
  return [...statuses].sort(
    (a, b) => toMinutes(a.time_of_event) - toMinutes(b.time_of_event),
  );
}

/** Returns ISO date strings for Mon–Sun of the current week. */
function getCurrentWeekDates(): string[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

/**
 * Returns ISO date strings for a rolling window of N days ending today.
 */
function getRollingDates(days: number): string[] {
  const now = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (days - 1 - i));
    return d.toISOString().split("T")[0];
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
    return d.toISOString().split("T")[0];
  }).filter((dateStr) => {
    const day = new Date(dateStr).getDay();
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
 * Firestore `in` queries are limited to 30 items — user IDs are chunked.
 * Date filtering is applied client-side to avoid the disjunction limit.
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

  const weekDates = getCurrentWeekDates();
  // 15-day window covers the rest requirement and the 7-day rolling window
  const rollingDates = getRollingDates(15);
  const twoWeekWorkdays = getTwoWeekWorkdayDates();

  const allQueryDates = [...new Set([...weekDates, ...rollingDates, ...twoWeekWorkdays])];
  const allQueryDatesSet = new Set(allQueryDates);

  // Chunk user IDs to respect Firestore's 30-item `in` limit
  const userIdChunks: string[][] = [];
  for (let i = 0; i < userIds.length; i += 30) {
    userIdChunks.push(userIds.slice(i, i + 30));
  }

  // Fetch all relevant HoS documents — date filtering applied client-side
  const rawDocs: { driverId: string; date: string; statuses: RawStatus[] }[] = [];

  await Promise.all(
    userIdChunks.map(async (chunk) => {
      const snap = await getDocs(
        query(collection(db, HOS_COLLECTION), where("driver_id", "in", chunk)),
      );
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.statuses?.length && allQueryDatesSet.has(data.date_of_document)) {
          rawDocs.push({
            driverId: data.driver_id,
            date: data.date_of_document,
            statuses: data.statuses,
          });
        }
      });
    }),
  );

  // Index all fetched docs by driverId → date → sorted statuses
  const docsByDriverAndDate = new Map<string, Map<string, RawStatus[]>>();
  for (const { driverId, date, statuses } of rawDocs) {
    if (!docsByDriverAndDate.has(driverId)) {
      docsByDriverAndDate.set(driverId, new Map());
    }
    docsByDriverAndDate.get(driverId)!.set(date, sortStatuses(statuses));
  }

  // Track submitted dates per driver for the missing HoS check
  const submittedDatesByDriver = new Map<string, Set<string>>();
  for (const { driverId, date } of rawDocs) {
    if (!submittedDatesByDriver.has(driverId)) {
      submittedDatesByDriver.set(driverId, new Set());
    }
    submittedDatesByDriver.get(driverId)!.add(date);
  }

  let earliestThisWeek: (MetricDriverDetail & { totalMins: number }) | null = null;
  let latestThisWeek: (MetricDriverDetail & { totalMins: number }) | null = null;
  const offendingDriverMap = new Map<string, MetricDriverDetail>();

  // ── Per-user compliance evaluation ──────────────────────────────────────────
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

    // ── MTO daily violations (checked per day in the rolling window) ──
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

    // ── MTO weekly on-duty violation (rolling 7-day window ending today) ──
    const sevenDayWindow = rollingDates.slice(-7);
    const weeklyViolation = checkWeeklyOnDuty(docsByDate, sevenDayWindow);

    // ── MTO 15-day rest requirement ──
    const restViolation = checkRestRequirement(docsByDate, rollingDates);

    // Collect all violations for this user
    const allViolations: MtoViolation[] = [
      ...dailyViolations.flatMap((d) => d.violations),
      ...(weeklyViolation ? [weeklyViolation] : []),
      ...(restViolation ? [restViolation] : []),
    ];

    if (allViolations.length > 0) {
      // Use the most recent offending day as the representative date
      const offendingDate =
        dailyViolations.length > 0
          ? dailyViolations[dailyViolations.length - 1].date
          : rollingDates[rollingDates.length - 1];

      const representativeStatuses = docsByDate.get(offendingDate) ?? [];

      offendingDriverMap.set(user.id, {
        driverId: user.id,
        driverName: user.name,
        date: offendingDate,
        statuses: representativeStatuses,
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
