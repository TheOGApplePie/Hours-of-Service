import { Driver } from "@/lib/driverService";

/**
 * Driver profile data-access contract.
 * Current implementation: Firestore (lib/firebase/FirebaseDriverRepository.ts)
 * Future: Azure Cosmos DB, Azure SQL, etc.
 */
export interface IDriverRepository {
  fetchAll(): Promise<Driver[]>;
  fetchById(uid: string): Promise<Partial<Driver> | undefined>;
}
