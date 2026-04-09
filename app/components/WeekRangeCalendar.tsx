"use client";

import { useMemo, useState } from "react";
import {
  snapToWeekStart,
  snapToWeekEnd,
  buildCalendarGrid,
  addMonths,
  isSameMonth,
  isSameDay,
  isWithinInterval,
  format,
} from "@/lib/weekUtils";

export interface WeekRangeCalendarProps {
  rangeStart: Date | null;
  rangeEnd: Date | null;
  /** Called with the Monday and Sunday of the clicked week. */
  onWeekClick: (monday: Date, sunday: Date) => void;
}

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const YEAR_RANGE = 5;

type CalendarView = "days" | "months" | "years";

export default function WeekRangeCalendar({
  rangeStart,
  rangeEnd,
  onWeekClick,
}: WeekRangeCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => snapToWeekStart(new Date()));
  const [calendarView, setCalendarView] = useState<CalendarView>("days");

  const today = new Date();
  const currentYear = today.getFullYear();
  const viewYear = viewMonth.getFullYear();
  const viewMonthIndex = viewMonth.getMonth();

  const gridDays = useMemo(() => buildCalendarGrid(viewMonth), [viewMonth]);
  const yearList = useMemo(
    () => Array.from({ length: YEAR_RANGE }, (_, i) => currentYear - i),
    [currentYear],
  );

  function isDayInRange(day: Date): boolean {
    if (!rangeStart || !rangeEnd) return false;
    return isWithinInterval(day, { start: rangeStart, end: rangeEnd });
  }

  function handleDayClick(day: Date) {
    onWeekClick(snapToWeekStart(day), snapToWeekEnd(day));
  }

  function handleMonthSelect(monthIndex: number) {
    const next = new Date(viewMonth);
    next.setMonth(monthIndex);
    setViewMonth(next);
    setCalendarView("days");
  }

  function handleYearSelect(year: number) {
    const next = new Date(viewMonth);
    next.setFullYear(year);
    setViewMonth(next);
    setCalendarView("months");
  }

  // ── Year picker ──
  if (calendarView === "years") {
    return (
      <div className="flex flex-col gap-2 select-none">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Select year</span>
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
            onClick={() => setCalendarView("days")}
          >
            Cancel
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {yearList.map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => handleYearSelect(year)}
              className={`py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                year === viewYear ? "btn-primary-action" : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Month picker ──
  if (calendarView === "months") {
    return (
      <div className="flex flex-col gap-2 select-none">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-sm font-semibold text-gray-700 hover:text-colour-primary transition-colors cursor-pointer"
            onClick={() => setCalendarView("years")}
          >
            {viewYear} ▾
          </button>
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
            onClick={() => setCalendarView("days")}
          >
            Cancel
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MONTH_NAMES.map((name, i) => {
            const isFuture = viewYear === currentYear && i > today.getMonth();
            return (
              <button
                key={name}
                type="button"
                disabled={isFuture}
                onClick={() => handleMonthSelect(i)}
                className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                  isFuture
                    ? "opacity-30 cursor-not-allowed"
                    : i === viewMonthIndex
                      ? "btn-primary-action cursor-pointer"
                      : "hover:bg-gray-100 text-gray-700 cursor-pointer"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Day grid ──
  return (
    <div className="flex flex-col gap-2 select-none">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="p-1 rounded hover:bg-gray-100 text-gray-600 cursor-pointer"
          onClick={() => setViewMonth((m) => addMonths(m, -1))}
        >
          ←
        </button>
        <button
          type="button"
          className="text-sm font-semibold text-gray-700 hover:text-colour-primary transition-colors px-2 py-1 rounded hover:bg-colour-primary cursor-pointer"
          style={{ "--hover-bg": "var(--colour-primary)" } as React.CSSProperties}
          onClick={() => setCalendarView("months")}
        >
          {format(viewMonth, "MMMM yyyy")} ▾
        </button>
        <button
          type="button"
          className="p-1 rounded hover:bg-gray-100 text-gray-600 cursor-pointer"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 text-center">
        {DAY_HEADERS.map((h) => (
          <span key={h} className="text-xs font-medium text-gray-400 py-1">
            {h}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {gridDays.map((day) => {
          const inRange = isDayInRange(day);
          const isStart = rangeStart ? isSameDay(day, rangeStart) : false;
          const isEnd = rangeEnd ? isSameDay(day, rangeEnd) : false;
          const isToday = isSameDay(day, today);
          const isFaded = !isSameMonth(day, viewMonth);
          const isFuture = day > today;

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={isFuture}
              onClick={() => handleDayClick(day)}
              className={[
                "py-1.5 text-xs transition-colors",
                isFuture ? "opacity-25 cursor-not-allowed" : "cursor-pointer",
                isFaded && !inRange ? "text-gray-300" : "",
                inRange && !isStart && !isEnd ? "day-in-range" : "",
                isStart ? "day-range-start" : "",
                isEnd ? "day-range-end" : "",
                isStart && isEnd ? "rounded-full" : "",
                isToday && !inRange ? "font-bold underline" : "",
                !inRange && !isFuture && !isFaded ? "hover:bg-gray-100" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-400">
        Click any day to select its full week (Mon–Sun).
      </p>
    </div>
  );
}
