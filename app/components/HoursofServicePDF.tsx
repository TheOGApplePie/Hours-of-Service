"use client";

import { DailyDocument, Status } from "@/types/dailyDocument";
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  Canvas,
} from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";

const PAGE_WIDTH = 467;
const LABELS_WIDTH = 40;
const TOTALS_WIDTH = 40;
const GRAPH_HEIGHT = 60;
const ROW_HEIGHT = GRAPH_HEIGHT / 5;

const styles = StyleSheet.create({
  page: {
    padding: "1cm",
    fontSize: 9,
  },
  driverHeading: {
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 8,
  },
  gridWrapper: {
    marginTop: 5,
    marginBottom: 5,
  },
  dateLabel: {
    marginBottom: 2,
  },
  comments: {
    marginTop: 2,
    color: "#555555",
  },
});

// ── Graph ─────────────────────────────────────────────────────────────────────

const LogGraph = ({ statuses }: { statuses: Status[] }) => (
  <Canvas
    style={{ width: PAGE_WIDTH, height: GRAPH_HEIGHT }}
    paint={(painter, width, height) => {
      const hourWidth = width / 24;
      const rowHeight = height / 4;

      painter.rect(0, 0, width, height).stroke();

      for (let i = 1; i < 24; i++) {
        painter
          .moveTo(i * hourWidth, 0)
          .lineTo(i * hourWidth, height)
          .stroke();
      }
      for (let i = 1; i < 4; i++) {
        painter
          .moveTo(0, i * rowHeight)
          .lineTo(width, i * rowHeight)
          .stroke();
      }

      const sorted = [...statuses].sort((a, b) =>
        +a.time_of_event.hour === +b.time_of_event.hour
          ? +a.time_of_event.minute - +b.time_of_event.minute
          : +a.time_of_event.hour - +b.time_of_event.hour,
      );

      const getY = (type: string) => {
        if (type === "off-duty") return rowHeight;
        if (type === "on-duty-driving") return rowHeight * 2;
        return rowHeight * 3;
      };

      const colourFor = (type: string) => {
        if (type === "off-duty") return "#ff0000";
        if (type === "on-duty-not-driving") return "#f8c422";
        return "#00cc00";
      };

      painter.lineWidth(2);

      for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        const currentX =
          (+current.time_of_event.hour + +current.time_of_event.minute / 60) *
          hourWidth;
        const currentY = getY(current.type);

        if (i === 0) {
          painter
            .moveTo(0, rowHeight)
            .lineTo(currentX, rowHeight)
            .strokeColor("#ff0000")
            .stroke();
          painter
            .moveTo(currentX, rowHeight)
            .lineTo(currentX, currentY)
            .strokeColor("#ff0000")
            .stroke();
        }

        if (i < sorted.length - 1) {
          const next = sorted[i + 1];
          const nextX =
            (+next.time_of_event.hour + +next.time_of_event.minute / 60) *
            hourWidth;
          const nextY = getY(next.type);
          const colour = colourFor(current.type);

          painter
            .moveTo(currentX, currentY)
            .lineTo(nextX, currentY)
            .strokeColor(colour)
            .stroke();
          painter
            .moveTo(nextX, currentY)
            .lineTo(nextX, nextY)
            .strokeColor(colour)
            .stroke();
        }

        if (i === sorted.length - 1) {
          painter
            .moveTo(currentX, currentY)
            .lineTo(currentX, rowHeight)
            .strokeColor("#ff0000")
            .stroke();
          painter
            .moveTo(currentX, rowHeight)
            .lineTo(width, rowHeight)
            .strokeColor("#ff0000")
            .stroke();
        }

        painter.circle(currentX, currentY, 3).fill("#000000");
      }

      return null;
    }}
  />
);

const HourAxis = () => (
  <View
    style={{
      flexDirection: "row",
      width: PAGE_WIDTH + LABELS_WIDTH + TOTALS_WIDTH,
    }}
  >
    <View style={{ width: LABELS_WIDTH }} />
    <View style={{ flexDirection: "row", width: PAGE_WIDTH }}>
      {Array.from({ length: 24 }).map((_, i) => (
        <Text key={i} style={{ width: PAGE_WIDTH / 24, textAlign: "left" }}>
          {String(i).padStart(2, "0")}
        </Text>
      ))}
    </View>
  </View>
);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Splits an array into chunks of the given size. */
function chunkDates(dates: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < dates.length; i += size) {
    chunks.push(dates.slice(i, i + size));
  }
  return chunks;
}

/**
 * Computes off-duty, on-duty-driving, and on-duty-not-driving totals
 * in minutes from a sorted status array.
 */
function calcDailyTotals(statuses: Status[]): {
  offDuty: number;
  driving: number;
  notDriving: number;
} {
  const sorted = [...statuses].sort((a, b) =>
    a.time_of_event.hour !== b.time_of_event.hour
      ? a.time_of_event.hour - b.time_of_event.hour
      : a.time_of_event.minute - b.time_of_event.minute,
  );

  let offDuty = 0;
  let driving = 0;
  let notDriving = 0;

  if (!sorted.length) return { offDuty: 24 * 60, driving: 0, notDriving: 0 };

  // Lead-in before first status is off-duty
  offDuty += sorted[0].time_of_event.hour * 60 + sorted[0].time_of_event.minute;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const segMins =
      sorted[i].time_of_event.hour * 60 +
      sorted[i].time_of_event.minute -
      (prev.time_of_event.hour * 60 + prev.time_of_event.minute);

    if (prev.type === "off-duty") offDuty += segMins;
    else if (prev.type === "on-duty-driving") driving += segMins;
    else notDriving += segMins;
  }

  // Trail-out after last status
  const last = sorted[sorted.length - 1];
  const trailMins =
    24 * 60 - (last.time_of_event.hour * 60 + last.time_of_event.minute);
  if (last.type === "off-duty") offDuty += trailMins;
  else if (last.type === "on-duty-driving") driving += trailMins;
  else notDriving += trailMins;

  return { offDuty, driving, notDriving };
}

/** Formats minutes as "Xh" or "Xh Ym" (minutes omitted when zero). */
function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Labels column — sits to the LEFT of the graph.
 * Each label aligns with its corresponding grid row.
 */
const DailyLabels = () => {
  const rowStyle = {
    height: ROW_HEIGHT,
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    justifyContent: "flex-end" as const,
    paddingRight: 3,
  };
  const labelStyle = { fontSize: 7, color: "#555555" };

  return (
    <View style={{ width: LABELS_WIDTH }}>
      <View style={{ height: ROW_HEIGHT }} />
      <View style={rowStyle}>
        <Text style={labelStyle}>Off Duty</Text>
      </View>
      <View style={rowStyle}>
        <Text style={labelStyle}>Driving</Text>
      </View>
      <View style={rowStyle}>
        <Text style={labelStyle}>Not Driving</Text>
      </View>
    </View>
  );
};

/**
 * Values column — sits to the RIGHT of the graph.
 * Each value aligns with its corresponding grid row.
 */
const DailyTotals = ({ statuses }: { statuses: Status[] }) => {
  const { offDuty, driving, notDriving } = calcDailyTotals(statuses);
  const total = offDuty + driving + notDriving;

  const rowStyle = {
    height: ROW_HEIGHT,
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    paddingLeft: 3,
  };
  const valueStyle = { fontSize: 7, fontWeight: "bold" as const };

  return (
    <View style={{ width: TOTALS_WIDTH }}>
      <View style={{ height: ROW_HEIGHT }} />
      <View style={rowStyle}>
        <Text style={valueStyle}>{fmtMins(offDuty)}</Text>
      </View>
      <View style={rowStyle}>
        <Text style={valueStyle}>{fmtMins(driving)}</Text>
      </View>
      <View style={rowStyle}>
        <Text style={valueStyle}>{fmtMins(notDriving)}</Text>
      </View>
      <View style={rowStyle}>
        <Text style={valueStyle}>Total: {fmtMins(total)}</Text>
      </View>
    </View>
  );
};

// ── Single week page ──────────────────────────────────────────────────────────

const WeekPage = ({
  driverName,
  weekDates,
  docsByDate,
}: {
  driverName: string;
  weekDates: string[];
  docsByDate: Map<string, DailyDocument>;
}) => {
  const weekParkingLocation =
    weekDates.map((d) => docsByDate.get(d)?.parking_location).find(Boolean) ??
    "";

  return (
    <Page size="A4" style={styles.page}>
      {/* Header: driver name and location on one line */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <Text style={styles.driverHeading}>{driverName}</Text>
        {weekParkingLocation ? (
          <Text style={{ fontSize: 9, alignSelf: "flex-end", marginBottom: 2 }}>
            Parking Location: {weekParkingLocation}
          </Text>
        ) : null}
      </View>

      {weekDates.map((date) => {
        const log = docsByDate.get(date);
        const statuses = log?.statuses ?? [];
        return (
          <View key={date} style={styles.gridWrapper}>
            <Text style={styles.dateLabel}>
              {format(parseISO(date), "PPPP")}
            </Text>
            <HourAxis />
            <View style={{ flexDirection: "row" }}>
              <DailyLabels />
              <LogGraph statuses={statuses} />
              <DailyTotals statuses={statuses} />
            </View>
            {log?.comments ? (
              <Text style={styles.comments}>Comments: {log.comments}</Text>
            ) : null}
          </View>
        );
      })}

      {/* Signature line at the bottom of the page */}
      <View style={{ marginTop: 16 }}>
        <Text style={{ fontSize: 7, color: "#555555" }}>
          Driver signature:
          <Text style={{ fontFamily: "Times-Italic", fontSize: 18 }}>
            {driverName}
          </Text>
        </Text>
      </View>
    </Page>
  );
};

/**
 * Renders one page per week for a single driver.
 * Dates are split into chunks of 7 — each chunk becomes its own page.
 */
const DriverPages = ({
  driverName,
  dates,
  docsByDate,
}: {
  driverName: string;
  dates: string[];
  docsByDate: Map<string, DailyDocument>;
}) => (
  <>
    {chunkDates(dates, 7).map((weekDates) => (
      <WeekPage
        key={weekDates[0]}
        driverName={driverName}
        weekDates={weekDates}
        docsByDate={docsByDate}
      />
    ))}
  </>
);

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Single-driver weekly PDF (used on the documents listing page).
 */
export const DailyLogDocument = ({
  logs,
  driverName,
  dates,
}: {
  logs: DailyDocument[];
  driverName: string;
  dates: string[];
}) => {
  const docsByDate = new Map(logs.map((log) => [log.date_of_document, log]));

  return (
    <Document>
      <DriverPages
        driverName={driverName}
        dates={dates}
        docsByDate={docsByDate}
      />
    </Document>
  );
};

/**
 * Multi-driver bulk PDF.
 * Each driver gets one page per week. Dates are the same for all drivers.
 */
export const BulkLogDocument = ({
  drivers,
  dates,
  docIndex,
}: {
  drivers: { id: string; name: string }[];
  dates: string[];
  docIndex: Map<string, Map<string, DailyDocument>>;
}) => (
  <Document>
    {drivers.map((driver) => (
      <DriverPages
        key={driver.id}
        driverName={driver.name}
        dates={dates}
        docsByDate={docIndex.get(driver.id) ?? new Map()}
      />
    ))}
  </Document>
);
