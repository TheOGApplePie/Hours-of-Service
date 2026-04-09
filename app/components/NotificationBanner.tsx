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
  checkMissingResolved,
} from "@/lib/hosService";
import { format } from "date-fns";

interface NotificationBannerProps {
  driverId: string;
  driverName?: string | null;
}

interface ActiveBanner {
  notification: Notification;
  /** Whether this banner is for a violation (red) or missing Hours of Service (gold). */
  isViolation: boolean;
}

/**
 * Fetches the latest violation and missing_hos notifications for a driver,
 * checks whether each has been resolved by re-evaluating the underlying data,
 * and renders a banner for any that are still active.
 *
 * Resolution logic (Option C hybrid):
 * - missing_hos: resolved when all related_dates now have a submission
 * - violation:   resolved when the offending day is now within limits,
 *                OR when a manager has marked the notification as "resolved"
 *
 * The notification is also marked as read when first displayed.
 * Date chips are clickable and navigate directly to that day's document.
 */
export default function NotificationBanner({
  driverId,
  driverName,
}: NotificationBannerProps) {
  const [banners, setBanners] = useState<ActiveBanner[]>([]);

  useEffect(() => {
    if (!driverId) return;

    async function loadBanners() {
      const [violationNotif, missingNotif] = await Promise.all([
        getLatestNotification(driverId, "violation"),
        getLatestNotification(driverId, "missing_hos"),
      ]);

      const activeBanners: ActiveBanner[] = [];

      if (violationNotif && violationNotif.status !== "resolved") {
        const violationDate = violationNotif.related_dates[0];
        const isFixed = violationDate
          ? await checkViolationResolved(driverId, violationDate)
          : false;

        if (!isFixed) {
          activeBanners.push({ notification: violationNotif, isViolation: true });
          if (!violationNotif.read) markNotificationRead(violationNotif.id);
        }
      }

      if (missingNotif && missingNotif.status !== "resolved") {
        const isFixed = await checkMissingResolved(
          driverId,
          missingNotif.related_dates,
        );

        if (!isFixed) {
          activeBanners.push({ notification: missingNotif, isViolation: false });
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
      {banners.map(({ notification, isViolation }) => (
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

          {notification.related_dates.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {notification.related_dates.map((date) => (
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
            {format(notification.sent_at.toDate(), "d MMM yyyy 'at' HH:mm")}
          </p>
        </div>
      ))}
    </div>
  );
}
