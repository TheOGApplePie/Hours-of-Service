"use client";

import { useMemo, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { Driver } from "@/lib/driverService";
import { DashboardMetrics } from "@/types/dashboard";
import { fetchDocumentsForBulkExport } from "@/lib/bulkExportService";
import { BulkLogDocument } from "./HoursofServicePDF";
import WeekRangeCalendar from "./WeekRangeCalendar";
import {
  snapToWeekStart,
  snapToWeekEnd,
  getDatesBetween,
  countWeeks,
  formatWeekRange,
  format,
} from "@/lib/weekUtils";

const MAX_USERS = 50;
const MAX_WEEKS = 8;

interface BulkExportModalProps {
  drivers: Driver[];
  metrics: DashboardMetrics | null;
  onClose: () => void;
}

// ── Driver selector ───────────────────────────────────────────────────────────

interface DriverSelectorProps {
  users: Driver[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onSelectOffending: () => void;
  onSelectMissing: () => void;
  offendingIds: Set<string>;
  missingIds: Set<string>;
}

function DriverSelector({
  users,
  selectedIds,
  onToggle,
  onSelectAll,
  onSelectOffending,
  onSelectMissing,
  offendingIds,
  missingIds,
}: DriverSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap">
        <button type="button" className="btn-action" onClick={onSelectAll}>
          Select All ({users.length})
        </button>
        <button
          type="button"
          className="btn-warning-action"
          disabled={offendingIds.size === 0}
          onClick={onSelectOffending}
        >
          Offending ({offendingIds.size})
        </button>
        <button
          type="button"
          className="btn-error-action"
          disabled={missingIds.size === 0}
          onClick={onSelectMissing}
        >
          Missing Hours of Service ({missingIds.size})
        </button>
      </div>

      <input
        type="text"
        placeholder="Search users…"
        className="border rounded-lg p-2 text-sm w-full"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
        {filteredUsers.length === 0 && (
          <p className="text-sm text-gray-400">No users match your search.</p>
        )}
        {filteredUsers.map((user) => (
          <label
            key={user.id}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={selectedIds.has(user.id)}
              onChange={() => onToggle(user.id)}
            />
            <span className="text-sm font-medium text-gray-800">{user.name}</span>
            <span className="text-xs text-gray-400 capitalize ml-auto">
              {user.role}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Export summary ────────────────────────────────────────────────────────────

function ExportSummary({
  userCount,
  weekCount,
  totalDocuments,
  atUserLimit,
  atWeekLimit,
}: {
  userCount: number;
  weekCount: number;
  totalDocuments: number;
  atUserLimit: boolean;
  atWeekLimit: boolean;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-1 text-sm">
      <div className="flex justify-between">
        <span className="text-gray-600">Users selected</span>
        <span className={`font-semibold ${atUserLimit ? "text-colour-error" : "text-gray-800"}`}>
          {userCount}
          {atUserLimit && ` (max ${MAX_USERS})`}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-600">Weeks selected</span>
        <span className={`font-semibold ${atWeekLimit ? "text-colour-error" : "text-gray-800"}`}>
          {weekCount}
          {atWeekLimit && ` (max ${MAX_WEEKS})`}
        </span>
      </div>
      <div className="flex justify-between border-t pt-1 mt-1">
        <span className="text-gray-600">Total documents to generate</span>
        <span className="font-bold text-gray-800">{totalDocuments}</span>
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function BulkExportModal({
  drivers,
  metrics,
  onClose,
}: BulkExportModalProps) {
  // Week range — both dates are always snapped to Mon/Sun boundaries
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  // True after the first week click; the next click extends the range
  const [awaitingSecondClick, setAwaitingSecondClick] = useState(false);

  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [exportStatus, setExportStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const offendingIds = useMemo(
    () => new Set(metrics?.offendingDrivers.map((d) => d.driverId) ?? []),
    [metrics],
  );
  const missingIds = useMemo(
    () => new Set(metrics?.missingHoSDrivers.map((d) => d.driverId) ?? []),
    [metrics],
  );

  const selectedDates = useMemo<string[]>(() => {
    if (!rangeStart || !rangeEnd) return [];
    return getDatesBetween(rangeStart, rangeEnd);
  }, [rangeStart, rangeEnd]);

  const weekCount = useMemo(() => {
    if (!rangeStart || !rangeEnd) return 0;
    return countWeeks(rangeStart, rangeEnd);
  }, [rangeStart, rangeEnd]);

  const totalDocuments = selectedUserIds.size * selectedDates.length;
  const isOverUserLimit = selectedUserIds.size > MAX_USERS;
  const isOverWeekLimit = weekCount > MAX_WEEKS;
  const canExport =
    selectedUserIds.size > 0 &&
    selectedDates.length > 0 &&
    !isOverUserLimit &&
    !isOverWeekLimit &&
    exportStatus !== "loading";

  // ── Week selection ──

  function handleWeekClick(monday: Date, sunday: Date) {
    if (!awaitingSecondClick) {
      setRangeStart(monday);
      setRangeEnd(sunday);
      setAwaitingSecondClick(true);
    } else {
      // Extend range to encompass both the existing selection and the new week
      setRangeStart(monday < rangeStart! ? monday : rangeStart!);
      setRangeEnd(sunday > rangeEnd! ? sunday : rangeEnd!);
      setAwaitingSecondClick(false);
    }
    setExportStatus("idle");
  }

  // ── User selection ──

  function toggleUser(id: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedUserIds(new Set(drivers.map((d) => d.id)));
  }

  function selectOffending() {
    setSelectedUserIds((prev) => new Set([...prev, ...offendingIds]));
  }

  function selectMissing() {
    setSelectedUserIds((prev) => new Set([...prev, ...missingIds]));
  }

  // ── Export ──

  async function handleExport() {
    if (!canExport || !rangeStart || !rangeEnd) return;

    setExportStatus("loading");
    setErrorMessage(null);

    try {
      const selectedUsers = drivers.filter((d) => selectedUserIds.has(d.id));
      const docIndex = await fetchDocumentsForBulkExport(
        [...selectedUserIds],
        selectedDates,
      );

      const blob = await pdf(
        <BulkLogDocument
          drivers={selectedUsers}
          dates={selectedDates}
          docIndex={docIndex}
        />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `hours-of-service-bulk-${format(rangeStart, "yyyy-MM-dd")}_to_${format(rangeEnd, "yyyy-MM-dd")}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);

      setExportStatus("done");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Export failed. Please try again.",
      );
      setExportStatus("error");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">
            Bulk Export Hours of Service
          </h2>
          <button onClick={onClose} className="btn-action px-3 py-1 text-xl leading-none">
            ×
          </button>
        </div>

        {/* Step 1: Date range */}
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            1. Select date range
          </h3>
          <WeekRangeCalendar
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onWeekClick={handleWeekClick}
          />
          {rangeStart && rangeEnd && (
            <p className="text-xs text-colour-success font-medium">
              ✓ {formatWeekRange(rangeStart, rangeEnd)} — {weekCount} week
              {weekCount !== 1 ? "s" : ""}, {selectedDates.length} days
              {awaitingSecondClick && (
                <span className="text-colour-warning ml-2">
                  (click another week to extend the range)
                </span>
              )}
            </p>
          )}
          {isOverWeekLimit && (
            <p className="text-xs text-colour-error">
              Maximum {MAX_WEEKS} weeks per export. Please narrow your range.
            </p>
          )}
        </section>

        {/* Step 2: User selection */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            2. Select users
          </h3>
          <DriverSelector
            users={drivers}
            selectedIds={selectedUserIds}
            onToggle={toggleUser}
            onSelectAll={selectAll}
            onSelectOffending={selectOffending}
            onSelectMissing={selectMissing}
            offendingIds={offendingIds}
            missingIds={missingIds}
          />
          {isOverUserLimit && (
            <p className="text-xs text-colour-error">
              Maximum {MAX_USERS} users per export. Please deselect some.
            </p>
          )}
        </section>

        {(selectedUserIds.size > 0 || selectedDates.length > 0) && (
          <ExportSummary
            userCount={selectedUserIds.size}
            weekCount={weekCount}
            totalDocuments={totalDocuments}
            atUserLimit={isOverUserLimit}
            atWeekLimit={isOverWeekLimit}
          />
        )}

        {exportStatus === "error" && errorMessage && (
          <p className="text-sm text-colour-error">{errorMessage}</p>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" className="btn-action" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary-action"
            disabled={!canExport}
            onClick={handleExport}
          >
            {exportStatus === "loading" ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                Generating…
              </>
            ) : exportStatus === "done" ? (
              "✓ Downloaded"
            ) : (
              "Export PDF"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
