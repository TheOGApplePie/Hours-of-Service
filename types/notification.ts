export type NotificationType = "missing_hos" | "violation";
export type NotificationStatus = "sent" | "failed" | "resolved";

export interface Notification {
  id: string;
  /** UID of the driver this notification was sent to. */
  driver_id: string;
  /** Category of the notification. */
  type: NotificationType;
  /** Human-readable message sent to the driver. */
  message: string;
  /** UID of the manager who triggered the notification. */
  sent_by: string;
  sent_at: Date;
  created_at: Date;
  /** Dates relevant to the issue (e.g. missing submission dates or violation dates). */
  related_dates: string[];
  /** Delivery status — useful for retry logic and audit. */
  status: NotificationStatus;
  /** Whether the driver has read/acknowledged the notification. */
  read: boolean;
}

/** Shape used when creating a new notification — id and timestamps are set by the service. */
export type CreateNotificationInput = Omit<Notification, "id" | "sent_at" | "created_at">;
