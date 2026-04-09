import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { DailyDocument } from "@/types/dailyDocument";

const HOS_COLLECTION = "hours_of_service";

/**
 * Fetches all HoS documents for a set of drivers across a set of dates.
 *
 * Firestore `in` queries are limited to 30 items per clause. We chunk both
 * driver IDs and dates to stay within that limit, then run all chunks in
 * parallel to keep total fetch time low.
 *
 * Returns a map of driverId → (dateString → DailyDocument) for O(1) lookups
 * when building the PDF.
 */
export async function fetchDocumentsForBulkExport(
  driverIds: string[],
  dates: string[],
): Promise<Map<string, Map<string, DailyDocument>>> {
  if (!driverIds.length || !dates.length) {
    return new Map();
  }

  // Split into chunks of 30 to respect Firestore's `in` query limit
  const driverChunks = chunkArray(driverIds, 30);
  const dateChunks = chunkArray(dates, 30);

  const allDocs: DailyDocument[] = [];

  // Run all chunk combinations in parallel
  await Promise.all(
    driverChunks.flatMap((driverChunk) =>
      dateChunks.map(async (dateChunk) => {
        const snap = await getDocs(
          query(
            collection(db, HOS_COLLECTION),
            where("driver_id", "in", driverChunk),
            where("date_of_document", "in", dateChunk),
          ),
        );
        snap.docs.forEach((d) => {
          allDocs.push({ id: d.id, ...d.data() } as DailyDocument);
        });
      }),
    ),
  );

  // Index by driverId → date for fast lookup during PDF generation
  const index = new Map<string, Map<string, DailyDocument>>();
  for (const doc of allDocs) {
    const driverId = doc.driver_id ?? "";
    const date = doc.date_of_document;
    if (!index.has(driverId)) index.set(driverId, new Map());
    index.get(driverId)!.set(date, doc);
  }

  return index;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
