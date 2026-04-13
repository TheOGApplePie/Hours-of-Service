import { hosRepository } from "@/lib/firebase/index";
import { DailyDocument } from "@/types/dailyDocument";

/**
 * Fetches all HoS documents for a set of drivers across a set of dates.
 *
 * Returns a map of driverId → (dateString → DailyDocument) for O(1) lookups
 * when building the PDF.
 */
export async function fetchDocumentsForBulkExport(
  driverIds: string[],
  dates: string[],
): Promise<Map<string, Map<string, DailyDocument>>> {
  if (!driverIds.length || !dates.length) return new Map();

  const allDocs = await hosRepository.fetchForDrivers(driverIds, dates);

  const index = new Map<string, Map<string, DailyDocument>>();
  for (const doc of allDocs) {
    const driverId = doc.driver_id ?? "";
    const date = doc.date_of_document;
    if (!index.has(driverId)) index.set(driverId, new Map());
    index.get(driverId)!.set(date, doc);
  }

  return index;
}
