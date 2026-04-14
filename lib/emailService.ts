/**
 * Email service — business logic for sending driver reminder emails.
 *
 * Responsibilities:
 *   1. Enforce the 14-day anti-spam window.
 *   2. Fetch the driver's name and email from the repository.
 *   3. Build the email payload.
 *   4. Delegate sending to the injected IEmailProvider.
 *   5. Write an audit record to Firestore regardless of delivery outcome.
 *
 * This file contains NO Firebase SDK imports — all data access goes through
 * repository interfaces exported from lib/firebase/index.ts.
 */

import { driverRepository, notificationRepository } from "@/lib/firebase/index";
import { IEmailProvider } from "@/lib/email/IEmailProvider";
import { FirebaseEmailProvider } from "@/lib/email/FirebaseEmailProvider";
import { canSendNotification } from "@/lib/notificationService";
import { NotificationType } from "@/types/notification";

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_CHUNK_SIZE = 10;

/** Module-level default provider. Swap via setEmailProvider() or the optional parameter. */
const defaultEmailProvider: IEmailProvider = new FirebaseEmailProvider();

// ── Email content builders ────────────────────────────────────────────────────

function buildSubject(type: NotificationType, driverName: string): string {
  return type === "violation"
    ? `Hours of Service Violation – ${driverName}`
    : `Missing Hours of Service Submission – ${driverName}`;
}

function buildBody(type: NotificationType, driverName: string): string {
  if (type === "violation") {
    return [
      `Hi ${driverName},`,
      "",
      "We noticed that your hours of service is violating one or more MTO compliance requirements.",
      "",
      "Please log in to review your records and call a the office to discuss how we can address this.",
      "If you believe this is an error, contact your manager.",
      "",
      "Regards,",
      "Compliance Team",
    ].join("\n");
  }

  return [
    `Hi ${driverName},`,
    "",
    "This is a reminder that one or more daily Hours of Service submissions are missing from your account.",
    "",
    "Please log in and submit the missing records as soon as possible to remain in compliance with MTO regulations.",
    "If you have any questions, contact your manager.",
    "",
    "Regards,",
    "Compliance Team",
  ].join("\n");
}

// ── Single driver send ────────────────────────────────────────────────────────

/**
 * Sends a reminder email to a single driver and records the outcome in Firestore.
 *
 * The email provider is injected via the optional `emailProvider` parameter,
 * defaulting to FirebaseEmailProvider. To switch to Azure, pass an instance of
 * AzureEmailProvider — no other changes needed.
 *
 * @throws if the driver is not found, has no email on file, or is within the
 *         14-day anti-spam window. Email delivery failures are also re-thrown
 *         after the audit record is written.
 */
export async function sendDriverReminder(
  driverId: string,
  type: NotificationType,
  managerId: string,
  emailProvider: IEmailProvider = defaultEmailProvider,
): Promise<void> {
  // ── 1. Anti-spam guard ────────────────────────────────────────────────────
  const allowed = await canSendNotification(driverId, type);
  if (!allowed) {
    throw new Error(
      `A ${type} reminder was already sent to driver ${driverId} within the last 14 days.`,
    );
  }

  // ── 2. Resolve driver details ─────────────────────────────────────────────
  const driver = await driverRepository.fetchById(driverId);
  if (!driver) {
    throw new Error(`Driver not found: ${driverId}`);
  }

  const driverEmail = driver.email;
  if (!driverEmail) {
    throw new Error(
      `Driver ${driverId} has no email on file. Add an "email" field to their Firestore profile.`,
    );
  }

  const driverName = driver.name ?? "Driver";

  // ── 3. Build payload ──────────────────────────────────────────────────────
  const subject = buildSubject(type, driverName);
  const body = buildBody(type, driverName);

  // ── 4. Send — capture outcome without throwing yet ────────────────────────
  let status: "sent" | "failed" = "sent";
  let errorMessage: string | undefined;

  try {
    await emailProvider.sendEmail({
      to: driverEmail,
      subject,
      body,
      fromUserId: managerId,
    });
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  // ── 5. Audit record (always written, even on failure) ─────────────────────
  await notificationRepository.create({
    driver_id: driverId,
    type,
    message: body,
    sent_by: managerId,
    related_dates: [],
    status,
    read: false,
    ...(errorMessage ? { error_message: errorMessage } : {}),
  });

  // Re-throw after writing the record so the caller knows the send failed.
  if (status === "failed") {
    throw new Error(`Email delivery failed for driver ${driverId}: ${errorMessage}`);
  }
}

// ── Bulk send ─────────────────────────────────────────────────────────────────

export type BulkSendResult = {
  sent: string[];
  failed: { driverId: string; error: string }[];
};

/**
 * Sends reminders to multiple drivers, processed in batches of BATCH_CHUNK_SIZE
 * (currently 10) to avoid overwhelming the email provider.
 *
 * Failures are collected per-driver and returned in the result — they do NOT
 * abort the remaining sends.
 *
 * @example
 *   const result = await sendBulkDriverReminders(offendingIds, "violation", managerId);
 *   console.log(`Sent: ${result.sent.length}, Failed: ${result.failed.length}`);
 */
export async function sendBulkDriverReminders(
  driverIds: string[],
  type: NotificationType,
  managerId: string,
  emailProvider: IEmailProvider = defaultEmailProvider,
): Promise<BulkSendResult> {
  const sent: string[] = [];
  const failed: { driverId: string; error: string }[] = [];

  const batches = chunk(driverIds, BATCH_CHUNK_SIZE);

  for (const batch of batches) {
    await Promise.all(
      batch.map(async (driverId) => {
        try {
          await sendDriverReminder(driverId, type, managerId, emailProvider);
          sent.push(driverId);
        } catch (err) {
          failed.push({
            driverId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  }

  return { sent, failed };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
