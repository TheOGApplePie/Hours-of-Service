import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "./firebase";

export interface Driver {
  id: string;
  name: string;
  role: string;
  /** When false, this user is excluded from all compliance metrics. */
  is_active_driver: boolean;
}

/** Fetches all documents from the `drivers` collection. */
export async function fetchAllDrivers(): Promise<Driver[]> {
  const snapshot = await getDocs(collection(db, "drivers"));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Driver));
}

/** Fetches a single driver's profile by their Firebase Auth UID. */
export async function fetchUserDetails(
  uid: string,
): Promise<{ name?: string; role?: string; is_active_driver?: boolean } | undefined> {
  const docRef = doc(db, "drivers", uid);
  const snapshot = await getDoc(docRef);
  return snapshot.exists()
    ? (snapshot.data() as { name?: string; role?: string; is_active_driver?: boolean })
    : undefined;
}
