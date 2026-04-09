"use client";

import WeekRangeCalendar from "./WeekRangeCalendar";

interface DatePickerModalProps {
  closeDatePicker: () => void;
  /** Called with the Monday of the selected week. */
  setDate: (date: Date) => void;
}

/**
 * Modal for navigating to a specific week on the documents listing page.
 * Clicking any day on the calendar immediately selects that week and closes.
 */
export default function DatePickerModal({
  closeDatePicker,
  setDate,
}: Readonly<DatePickerModalProps>) {
  function handleWeekClick(monday: Date) {
    setDate(monday);
    closeDatePicker();
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={closeDatePicker}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 w-96 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-800">Navigate to week</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Click any day to jump to that week
            </p>
          </div>
          <button
            className="btn-action px-3 py-1 text-xl leading-none"
            onClick={closeDatePicker}
          >
            ×
          </button>
        </div>

        <WeekRangeCalendar
          rangeStart={null}
          rangeEnd={null}
          onWeekClick={handleWeekClick}
        />
      </div>
    </div>
  );
}
