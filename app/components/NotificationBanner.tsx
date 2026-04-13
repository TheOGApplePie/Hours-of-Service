"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Notification } from "@/types/notification";
import {
  getLatestNotification,
  markNotificationRead,
} from "@/lib/notificationService";
import {
  checkViolationResolved,
  fetchDocumentsForDates,
} from "@/lib/hosService";
import { format } from "date-fns";

interface NotificationBannerProps {
  driverId: string;
  driverName?: string | null;
}

interface ActiveBanner {
  notification: Notification;
  isViolation: boolean;
  /** For missing banners: the subset of related_dates still without a valid submission. */
  outstandingDates: string[];
}

/**
 * Fetches the latest violation and missing_hos notifications for a driver,
 * checks whether each has been resolved by re-evaluating the underlying data,
 * and renders a banner for any that are still active.
 *
 * For missing banners, only the dates that still lack a valid submission are
 * shown — if a driver has submitted some but not all, the banner updates to
 * reflect only the remaining outstanding dates.
 *
 * Resolution logic:
 * - violation:   resolved when the offending day is now within MTO limits,
 *                OR when a manager has marked the notification as "resolved"
 * - missing_hos: resolved when ALL related_dates have a valid submission
 */
export default function NotificationBanner({
  driverId,
  driverName,
}: Readonly<NotificationBannerProps>) {
  const [banners, setBanners] = useState<ActiveBanner[]>([]);

  useEffect(() => {
    if (!driverId) return;

    async function loadBanners() {
      const [violationNotif, missingNotif] = await Promise.all([
        getLatestNotification(driverId, "violation"),
        getLatestNotification(driverId, "missing_hos"),
      ]);

      const activeBanners: ActiveBanner[] = [];

      // ── Violation banner ──
      if (violationNotif && violationNotif.status !== "resolved") {
        const violationDate = violationNotif.related_dates[0];
        const isFixed = violationDate
          ? await checkViolationResolved(driverId, violationDate)
          : false;

        if (!isFixed) {
          activeBanners.push({
            notification: violationNotif,
            isViolation: true,
            outstandingDates: violationNotif.related_dates,
          });
          if (!violationNotif.read) markNotificationRead(violationNotif.id);
        }
      }

      // ── Missing Hours of Service banner ──
      if (missingNotif && missingNotif.status !== "resolved") {
        const relatedDates = missingNotif.related_dates;

        // Fetch which of the related dates now have a valid submission
        const submittedDocs = await fetchDocumentsForDates(
          driverId,
          relatedDates,
        );
        const submittedDateSet = new Set(
          submittedDocs
            .filter((doc) => isValidSubmission(doc.statuses))
            .map((doc) => doc.date_of_document),
        );

        const outstandingDates = relatedDates.filter(
          (date) => !submittedDateSet.has(date),
        );

        if (outstandingDates.length > 0) {
          activeBanners.push({
            notification: missingNotif,
            isViolation: false,
            outstandingDates,
          });
          if (!missingNotif.read) markNotificationRead(missingNotif.id);
        }
      }

      setBanners(activeBanners);
    }

    loadBanners();
  }, [driverId]);

  if (!banners.length) return null;

  function buildDateUrl(date: string): string {
    const params = new URLSearchParams({ driverId });
    if (driverName) params.set("driverName", driverName);
    return `/documents/${date}?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-2 mb-4">
      {banners.map(({ notification, isViolation, outstandingDates }) => (
        <div
          key={notification.id}
          className="rounded-lg px-4 py-3 flex flex-col gap-2"
          style={{
            backgroundColor: isViolation
              ? "var(--colour-error)"
              : "var(--colour-warning)",
            color: isViolation ? "white" : "#111",
          }}
        >
          <p className="font-semibold text-sm">{notification.message}</p>

          {outstandingDates.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {outstandingDates.map((date) => (
                <li key={date}>
                  <Link
                    href={buildDateUrl(date)}
                    className="text-xs font-semibold px-2 py-0.5 rounded cursor-pointer underline-offset-2 hover:underline"
                    style={{
                      backgroundColor: isViolation
                        ? "rgba(255,255,255,0.2)"
                        : "rgba(0,0,0,0.1)",
                    }}
                  >
                    {date}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs opacity-70">
            Sent on{" "}
            {format(notification.sent_at, "d MMM yyyy 'at' HH:mm")}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Returns true if a document's statuses constitute a valid submission.
 * Duplicated here to avoid a circular import with hosService.
 * - Empty → invalid
 * - First status off-duty → requires at least 2 entries
 * - First status on-duty → 1 entry is sufficient
 */
function isValidSubmission(
  statuses: { type: string; time_of_event: { hour: number; minute: number } }[],
): boolean {
  if (!statuses.length) return false;
  const sorted = [...statuses].sort(
    (a, b) =>
      a.time_of_event.hour * 60 +
      a.time_of_event.minute -
      (b.time_of_event.hour * 60 + b.time_of_event.minute),
  );
  if (sorted[0].type === "off-duty") return sorted.length >= 2;
  return true;
}
