import { DailyDocument } from "@/types/dailyDocument";

/**
 * Hours of Service document data-access contract.
 * Current implementation: Firestore (lib/firebase/FirebaseHosRepository.ts)
 * Future: Azure Cosmos DB, Azure SQL, etc.
 */
export interface IHosRepository {
  /** Fetch a single document for one driver on one date. */
  fetchOne(driverId: string, date: string): Promise<DailyDocument | undefined>;

  /** Fetch all documents for one driver across a set of dates. */
  fetchForDates(driverId: string, dates: string[]): Promise<DailyDocument[]>;

  /** Fetch the most recent document for a driver strictly before the given date. */
  fetchLatestBefore(driverId: string, beforeDate: string): Promise<DailyDocument | undefined>;

  /**
   * Fetch documents for multiple drivers.
   * When `dates` is provided, the implementation filters at the query level.
   * When omitted, all documents for the given drivers are returned.
   */
  fetchForDrivers(driverIds: string[], dates?: string[]): Promise<DailyDocument[]>;

  /** Create or update an HoS document. */
  save(document: DailyDocument): Promise<void>;
}
