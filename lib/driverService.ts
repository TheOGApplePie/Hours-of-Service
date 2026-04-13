import { driverRepository } from "@/lib/firebase/index";

export interface Driver {
  id: string;
  name: string;
  role: string;
  /** When false, this user is excluded from all compliance metrics. */
  is_active_driver: boolean;
}

/** Fetches all documents from the `drivers` collection. */
export async function fetchAllDrivers(): Promise<Driver[]> {
  return driverRepository.fetchAll();
}

/** Fetches a single driver's profile by their UID. */
export async function fetchUserDetails(
  uid: string,
): Promise<{ name?: string; role?: string; is_active_driver?: boolean } | undefined> {
  return driverRepository.fetchById(uid);
}
