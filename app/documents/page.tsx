"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, startOfWeek, formatDate } from "date-fns";
import { Calendar, ArrowRight } from "lucide-react";
import Link from "next/link";
import { pdf } from "@react-pdf/renderer";
import { useAuth } from "@/contexts/AuthContext";
import { fetchDocumentsForDates } from "@/lib/hosService";
import DatePickerModal from "../components/DatePickerModal";
import { DailyLogDocument } from "../components/HoursofServicePDF";
import NotificationBanner from "../components/NotificationBanner";

export default function Documents() {
  const today = new Date();
  const [weekDates, setWeekDates] = useState<Date[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const { userRole, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // When a manager/safety user navigates here from the dashboard, driverId and
  // driverName are passed as query params. Drivers fall back to their own UID.
  const driverId = searchParams.get("driverId") ?? user?.uid ?? "";
  const driverName = searchParams.get("driverName") ?? null;

  function buildWeekFrom(anchorDate: Date): Date[] {
    return Array.from({ length: 7 }, (_, i) =>
      addDays(startOfWeek(anchorDate, { weekStartsOn: 1 }), i),
    );
  }

  useEffect(() => {
    const savedDate = localStorage.getItem("selectedDate");
    setWeekDates(buildWeekFrom(savedDate ? new Date(savedDate) : new Date()));
  }, []);

  async function handlePrintHoS() {
    const dateStrings = weekDates.map((d) => d.toISOString().split("T")[0]);
    const logs = await fetchDocumentsForDates(driverId, dateStrings);

    const blob = await pdf(
      <DailyLogDocument
        dates={dateStrings}
        driverName={driverName ?? "Driver"}
        logs={logs}
      />,
    ).toBlob();

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "weekly-log.pdf";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function buildDocumentUrl(date: Date): string {
    const dateStr = formatDate(date, "yyyy-MM-dd");
    const params = new URLSearchParams({ driverId });
    if (driverName) params.set("driverName", driverName);
    return `/documents/${dateStr}?${params.toString()}`;
  }

  if (!weekDates.length) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto relative">
        {/* Header row: back button (non-drivers only) + driver name */}
        <div className="flex items-center gap-4 mb-2">
          {userRole !== "driver" && (
            <button
              className="btn-action"
              onClick={() => router.push("/dashboard")}
            >
              ← Back
            </button>
          )}
          {driverName && (
            <h2 className="text-xl font-semibold text-gray-800">
              Viewing: <span className="text-colour-success font-bold">{driverName}</span>
            </h2>
          )}
        </div>

        {/* Notification banner — shown when the driver has an active reminder */}
        <NotificationBanner driverId={driverId} driverName={driverName} />

        {/* Week navigation controls */}
        <div className="flex justify-between items-center gap-2 py-4 flex-wrap">
          <div className="flex items-center gap-4">
            <button
              className="btn-action rounded-2xl text-xl p-6"
              onClick={() => setWeekDates(buildWeekFrom(addDays(weekDates[0], -7)))}
            >
              Last week
            </button>
            <button
              className="btn-success rounded-2xl text-xl p-6"
              onClick={() => setWeekDates(buildWeekFrom(today))}
            >
              Today
            </button>
            <button
              className="btn-action rounded-2xl text-xl p-6"
              onClick={() => setWeekDates(buildWeekFrom(addDays(weekDates[6], 1)))}
            >
              Next week
            </button>
          </div>
          <div className="flex items-center gap-4">
            <button
              className="btn-action rounded-2xl text-xl p-6"
              onClick={() => setShowDatePicker(true)}
            >
              Navigate To Week
            </button>
            <button
              className="btn-primary-action rounded-2xl text-xl p-6"
              onClick={handlePrintHoS}
            >
              Print Hours of Service
            </button>
          </div>
        </div>

        {/* Date list */}
        <div className="grid gap-4">
          {weekDates.map((date) => {
            const dateStr = formatDate(date, "yyyy-MM-dd");
            const isToday = dateStr === formatDate(today, "yyyy-MM-dd");

            return (
              <Link
                key={date.toDateString()}
                href={buildDocumentUrl(date)}
                onClick={() => localStorage.setItem("selectedDate", dateStr)}
                className={`${
                  isToday ? "bg-colour-success text-white" : "bg-white"
                } rounded-lg p-6 cursor-pointer block transition-shadow hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)]`}
                style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-6 h-6 text-gray-600" />
                    <h3 className="text-lg font-semibold text-gray-800">
                      {formatDate(date, "PPPP")}
                    </h3>
                  </div>
                  <ArrowRight className="text-black" size={30} strokeWidth={2.5} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {showDatePicker && (
        <div className="fixed inset-0 z-40">
          <DatePickerModal
            closeDatePicker={() => setShowDatePicker(false)}
            setDate={(date) => {
              setWeekDates(buildWeekFrom(date));
              setShowDatePicker(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
