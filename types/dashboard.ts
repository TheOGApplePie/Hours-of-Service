import { RawStatus } from "./rawStatus";

/** A single driver's detail record used inside a dashboard metric. */
export interface MetricDriverDetail {
  driverId: string;
  driverName: string;
  /** The most relevant date for this metric entry (ISO yyyy-MM-dd). */
  date: string;
  /** Formatted HH:mm time — present for earliest/latest metrics. */
  time?: string;
  /** Raw statuses from the HoS document for that date. */
  statuses: RawStatus[];
  /** MTO violations broken down by rule — present for offending metric. */
  violations?: MtoViolation[];
  /** Workdays within the two-week window with no submission — present for missing metric. */
  missingDates?: string[];
}

/** A single broken MTO rule with the measured value for display. */
export interface MtoViolation {
  rule: MtoRule;
  /** Human-readable description of the breach, e.g. "14h 20m driving (max 13h)". */
  detail: string;
}

export type MtoRule =
  | "daily_driving"      // > 13h on-duty-driving in a day
  | "daily_on_duty"      // > 16h NOT off-duty in a day
  | "weekly_on_duty"     // > 70h NOT off-duty in rolling 7 days
  | "rest_15_day";       // no 24h off-duty block in rolling 15 days

export interface DashboardMetrics {
  earliestEventWeek: MetricDriverDetail | null;
  latestEventWeek: MetricDriverDetail | null;
  offendingDrivers: MetricDriverDetail[];
  missingHoSDrivers: MetricDriverDetail[];
}

export type MetricKind = "earliest" | "latest" | "offending" | "missing";
