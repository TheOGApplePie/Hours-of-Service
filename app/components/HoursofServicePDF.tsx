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

const PAGE_WIDTH = 550;

const styles = StyleSheet.create({
  page: {
    padding: 30,
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
    style={{ width: PAGE_WIDTH, height: 60 }}
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
  <View style={{ flexDirection: "row", width: PAGE_WIDTH }}>
    {Array.from({ length: 24 }).map((_, i) => (
      <Text key={i} style={{ width: PAGE_WIDTH / 24, textAlign: "left" }}>
        {String(i).padStart(2, "0")}
      </Text>
    ))}
  </View>
);

// ── Single-driver page ────────────────────────────────────────────────────────

const DriverPage = ({
  driverName,
  dates,
  docsByDate,
}: {
  driverName: string;
  dates: string[];
  docsByDate: Map<string, DailyDocument>;
}) => {
  // Use the parking location from the first day that has one recorded
  const weekParkingLocation =
    dates.map((d) => docsByDate.get(d)?.parking_location).find(Boolean) ?? "";

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.driverHeading}>{driverName}</Text>
      {weekParkingLocation ? (
        <Text style={{ marginBottom: 8 }}>Location: {weekParkingLocation}</Text>
      ) : null}
      {dates.map((date) => {
        const log = docsByDate.get(date);
        return (
          <View key={date} style={styles.gridWrapper}>
            <Text style={styles.dateLabel}>
              {format(parseISO(date), "PPPP")}
            </Text>
            <HourAxis />
            <LogGraph statuses={log?.statuses ?? []} />
            {log?.comments ? (
              <Text style={styles.comments}>Comments: {log.comments}</Text>
            ) : null}
          </View>
        );
      })}
    </Page>
  );
};

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
      <DriverPage
        driverName={driverName}
        dates={dates}
        docsByDate={docsByDate}
      />
    </Document>
  );
};

/**
 * Multi-driver bulk PDF.
 * Each driver gets their own page. Dates are the same for all drivers.
 */
export const BulkLogDocument = ({
  drivers,
  dates,
  docIndex,
}: {
  drivers: { id: string; name: string }[];
  dates: string[];
  /** driverId → (dateString → DailyDocument) */
  docIndex: Map<string, Map<string, DailyDocument>>;
}) => (
  <Document>
    {drivers.map((driver) => (
      <DriverPage
        key={driver.id}
        driverName={driver.name}
        dates={dates}
        docsByDate={docIndex.get(driver.id) ?? new Map()}
      />
    ))}
  </Document>
);
