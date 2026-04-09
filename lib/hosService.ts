import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  doc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { DailyDocument } from "@/types/dailyDocument";

const HOS_COLLECTION = "hours_of_service";

/**
 * Fetches a single HoS document for a given driver and date.
 * Returns undefined if no document exists for that date (not an error).
 */
export async function fetchDocument(
  dateOfDocument: string,
  driverId: string,
): Promise<DailyDocument | undefined> {
  const q = query(
    collection(db, HOS_COLLECTION),
    where("driver_id", "==", driverId),
    where("date_of_document", "==", dateOfDocument),
    limit(1),
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return undefined;

  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as DailyDocument;
}

/**
 * Fetches HoS documents for a driver across multiple dates.
 * Used for weekly PDF generation.
 */
export async function fetchDocumentsForDates(
  driverId: string,
  dates: string[],
): Promise<DailyDocument[]> {
  if (!dates.length) return [];

  const q = query(
    collection(db, HOS_COLLECTION),
    where("driver_id", "==", driverId),
    where("date_of_document", "in", dates),
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() } as DailyDocument),
  );
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
  const q = query(
    collection(db, HOS_COLLECTION),
    where("driver_id", "==", driverId),
    where("date_of_document", "<", beforeDate),
    orderBy("date_of_document", "desc"),
    limit(1),
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return undefined;

  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as DailyDocument;
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
 * An empty document or one starting with off-duty and having only one entry
 * does not count as a valid submission.
 */
export async function checkMissingResolved(
  driverId: string,
  relatedDates: string[],
): Promise<boolean> {
  if (!relatedDates.length) return true;
  const docs = await fetchDocumentsForDates(driverId, relatedDates);
  // Every related date must have a document that passes the validity check
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
  const payload = {
    date_of_document: document.date_of_document,
    driver_id: document.driver_id,
    parking_location: document.parking_location,
    comments: document.comments,
    statuses: document.statuses,
    updated_at: new Date(),
  };

  if (document.id) {
    await setDoc(doc(db, HOS_COLLECTION, document.id), {
      ...payload,
      created_at: new Date(document.created_at.seconds * 1000),
    });
  } else {
    await addDoc(collection(db, HOS_COLLECTION), {
      ...payload,
      created_at: new Date(),
    });
  }
}
