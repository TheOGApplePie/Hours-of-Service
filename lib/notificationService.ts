import { notificationRepository } from "@/lib/firebase/index";
import {
  Notification,
  NotificationType,
  CreateNotificationInput,
} from "@/types/notification";

const ANTI_SPAM_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Persists a new notification.
 * Returns the generated document ID.
 */
export async function createNotification(
  data: CreateNotificationInput,
): Promise<string> {
  return notificationRepository.create(data);
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Returns all notifications for a driver, sorted newest first.
 * Optionally filtered to a specific notification type.
 */
export async function getNotificationsByDriver(
  driverId: string,
  type?: NotificationType,
): Promise<Notification[]> {
  return notificationRepository.getByDriver(driverId, type);
}

/**
 * Returns the single most recent notification for a driver.
 * Optionally filtered to a specific type.
 * Returns null if no matching notification exists.
 */
export async function getLatestNotification(
  driverId: string,
  type?: NotificationType,
): Promise<Notification | null> {
  return notificationRepository.getLatest(driverId, type);
}

// ── Update ────────────────────────────────────────────────────────────────────

/** Marks a notification as resolved. */
export async function resolveNotification(notificationId: string): Promise<void> {
  return notificationRepository.resolve(notificationId);
}

/** Marks a notification as read. */
export async function markNotificationRead(notificationId: string): Promise<void> {
  return notificationRepository.markRead(notificationId);
}

// ── Anti-spam ─────────────────────────────────────────────────────────────────

/**
 * Returns true if it is safe to send a notification of the given type to the driver.
 * Blocks sending if a notification of the same type was sent within the anti-spam window.
 * Company policy: one reminder per two weeks (14 days).
 */
export async function canSendNotification(
  driverId: string,
  type: NotificationType,
): Promise<boolean> {
  const latest = await getLatestNotification(driverId, type);
  if (!latest) return true;

  const msSinceLastSent = Date.now() - latest.sent_at.getTime();
  return msSinceLastSent > ANTI_SPAM_WINDOW_MS;
}
