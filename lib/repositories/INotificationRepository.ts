import {
  Notification,
  NotificationType,
  CreateNotificationInput,
} from "@/types/notification";

/**
 * Notification data-access contract.
 * Current implementation: Firestore (lib/firebase/FirebaseNotificationRepository.ts)
 * Future: Azure Cosmos DB, Azure SQL, etc.
 */
export interface INotificationRepository {
  /** Persist a new notification. Returns the generated ID. */
  create(data: CreateNotificationInput): Promise<string>;

  /** Return all notifications for a driver, newest first. Optionally filter by type. */
  getByDriver(driverId: string, type?: NotificationType): Promise<Notification[]>;

  /** Return the single most recent notification for a driver, or null if none. */
  getLatest(driverId: string, type?: NotificationType): Promise<Notification | null>;

  /** Mark a notification as resolved. */
  resolve(id: string): Promise<void>;

  /** Mark a notification as read. */
  markRead(id: string): Promise<void>;
}
