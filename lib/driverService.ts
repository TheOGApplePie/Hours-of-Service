import { driverRepository } from "@/lib/firebase/index";

export interface Driver {
  id: string;
  name: string;
  role: "driver" | "safety" | "manager";
  /** When false, this user is excluded from all compliance metrics. */
  is_active_driver: boolean;
  /** Physical location/branch this driver belongs to, inherited from the creating manager. */
  organization_location?: string;
  /** ISO date string (YYYY-MM-DD) of when the driver was hired. */
  hire_date?: string;
  /** When true, this user has been soft-deleted and should not appear in any lists. */
  deleted?: boolean;
}

/** Fetches all non-deleted documents from the `drivers` collection. */
export async function fetchAllDrivers(): Promise<Driver[]> {
  const all = await driverRepository.fetchAll();
  return all.filter((d) => !d.deleted);
}

/** Fetches a single driver's profile by their UID. */
export async function fetchUserDetails(
  uid: string,
): Promise<Partial<Driver> | undefined> {
  return driverRepository.fetchById(uid);
}

/** Creates a Firestore profile document for a newly created Auth user. */
export async function createDriverProfile(
  uid: string,
  data: Omit<Driver, "id">,
): Promise<void> {
  return driverRepository.createProfile(uid, data);
}

/** Updates editable fields on a driver's profile. */
export async function updateDriverProfile(
  uid: string,
  data: Partial<Omit<Driver, "id">>,
): Promise<void> {
  return driverRepository.updateProfile(uid, data);
}

/** Soft-deletes a driver by flagging their Firestore document as deleted. */
export async function softDeleteDriver(uid: string): Promise<void> {
  return driverRepository.softDelete(uid);
}
