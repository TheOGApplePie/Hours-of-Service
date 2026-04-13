import { hosRepository } from "@/lib/firebase/index";
import { DailyDocument } from "@/types/dailyDocument";

/**
 * Fetches a single HoS document for a given driver and date.
 * Returns undefined if no document exists for that date (not an error).
 */
export async function fetchDocument(
  dateOfDocument: string,
  driverId: string,
): Promise<DailyDocument | undefined> {
  return hosRepository.fetchOne(driverId, dateOfDocument);
}

/**
 * Fetches HoS documents for a driver across multiple dates.
 * Used for weekly PDF generation.
 */
export async function fetchDocumentsForDates(
  driverId: string,
  dates: string[],
): Promise<DailyDocument[]> {
  return hosRepository.fetchForDates(driverId, dates);
}

/**
 * Fetches the most recent HoS document for a driver strictly before the given date.
 * Used to prefill the parking location when the current day has no document yet.
 * Returns undefined if no prior document exists.
 */
export async function fetchMostRecentDocumentBefore(
  driverId: string,
  beforeDate: string,
): Promise<DailyDocument | undefined> {
  return hosRepository.fetchLatestBefore(driverId, beforeDate);
}

/**
 * Checks whether a violation notification has been resolved by the driver.
 * Re-evaluates the offending day against MTO Ontario rules.
 * Returns true if no MTO violations remain on that day.
 */
export async function checkViolationResolved(
  driverId: string,
  date: string,
): Promise<boolean> {
  const hosDoc = await fetchDocument(date, driverId);
  if (!hosDoc?.statuses?.length) return false;

  const statuses = [...hosDoc.statuses].sort(
    (a, b) =>
      a.time_of_event.hour * 60 + a.time_of_event.minute -
      (b.time_of_event.hour * 60 + b.time_of_event.minute),
  );

  const { checkDailyDriving, checkDailyOnDuty } = await import("./mtoCompliance");
  return !checkDailyDriving(statuses) && !checkDailyOnDuty(statuses);
}

/**
 * Returns true if a document's statuses constitute a valid submission.
 *
 * Rules:
 * - Empty statuses → invalid
 * - First status (sorted by event time) is off-duty → requires at least 2 entries
 *   (an off-duty lead-in must be followed by at least one other status to be meaningful)
 * - First status is any on-duty type → requires at least 1 entry
 */
function isValidSubmission(statuses: DailyDocument["statuses"]): boolean {
  if (!statuses.length) return false;

  const sorted = [...statuses].sort(
    (a, b) =>
      a.time_of_event.hour * 60 + a.time_of_event.minute -
      (b.time_of_event.hour * 60 + b.time_of_event.minute),
  );

  if (sorted[0].type === "off-duty") return sorted.length >= 2;
  return true;
}

/**
 * Checks whether a missing Hours of Service notification has been resolved.
 * Returns true if all related_dates now have a valid submitted document.
 */
export async function checkMissingResolved(
  driverId: string,
  relatedDates: string[],
): Promise<boolean> {
  if (!relatedDates.length) return true;
  const docs = await fetchDocumentsForDates(driverId, relatedDates);
  const validDates = new Set(
    docs
      .filter((doc) => isValidSubmission(doc.statuses))
      .map((doc) => doc.date_of_document),
  );
  return relatedDates.every((date) => validDates.has(date));
}

/**
 * Creates or updates an HoS document.
 * If `document.id` is non-empty, updates the existing record.
 * Otherwise creates a new one.
 */
export async function saveDocument(document: DailyDocument): Promise<void> {
  return hosRepository.save(document);
}
