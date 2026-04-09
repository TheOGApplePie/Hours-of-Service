import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  doc,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  Notification,
  NotificationType,
  CreateNotificationInput,
} from "@/types/notification";

const NOTIFICATIONS_COLLECTION = "notifications";

/** How long must pass before the same notification type can be sent to the
 *  same driver again. Company policy: one reminder per two weeks (14 days). */
const ANTI_SPAM_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Persists a new notification document to Firestore.
 * Sets `sent_at` and `created_at` to the current server time.
 * Returns the generated document ID.
 */
export async function createNotification(
  data: CreateNotificationInput,
): Promise<string> {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
    ...data,
    sent_at: now,
    created_at: now,
  });
  return docRef.id;
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Returns all notifications for a driver, sorted newest first.
 * Optionally filtered to a specific notification type.
 *
 * Requires a composite Firestore index on:
 *   driver_id ASC, sent_at DESC
 * (and a second index with type ASC added when filtering by type)
 */
export async function getNotificationsByDriver(
  driverId: string,
  type?: NotificationType,
): Promise<Notification[]> {
  const constraints = [
    where("driver_id", "==", driverId),
    ...(type ? [where("type", "==", type)] : []),
    orderBy("sent_at", "desc"),
  ];

  const snap = await getDocs(
    query(collection(db, NOTIFICATIONS_COLLECTION), ...constraints),
  );

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notification));
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
  const constraints = [
    where("driver_id", "==", driverId),
    ...(type ? [where("type", "==", type)] : []),
    orderBy("sent_at", "desc"),
    limit(1),
  ];

  const snap = await getDocs(
    query(collection(db, NOTIFICATIONS_COLLECTION), ...constraints),
  );

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() } as Notification;
}

// ── Update ────────────────────────────────────────────────────────────────────

/** Marks a notification as resolved — used by managers to dismiss a violation banner. */
export async function resolveNotification(notificationId: string): Promise<void> {
  await updateDoc(doc(db, NOTIFICATIONS_COLLECTION, notificationId), {
    status: "resolved",
  });
}

/** Marks a notification as read — called when the driver views their banner. */
export async function markNotificationRead(notificationId: string): Promise<void> {
  await updateDoc(doc(db, NOTIFICATIONS_COLLECTION, notificationId), {
    read: true,
  });
}

// ── Anti-spam ─────────────────────────────────────────────────────────────────

/**
 * Returns true if it is safe to send a notification of the given type to the driver.
 * Blocks sending if a notification of the same type was sent within the anti-spam window.
 */
export async function canSendNotification(
  driverId: string,
  type: NotificationType,
): Promise<boolean> {
  const latest = await getLatestNotification(driverId, type);
  if (!latest) return true;

  const msSinceLastSent = Date.now() - latest.sent_at.toMillis();
  return msSinceLastSent > ANTI_SPAM_WINDOW_MS;
}
