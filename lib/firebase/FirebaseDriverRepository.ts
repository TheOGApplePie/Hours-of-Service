import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { IDriverRepository } from "@/lib/repositories/IDriverRepository";
import { Driver } from "@/lib/driverService";

export class FirebaseDriverRepository implements IDriverRepository {
  async fetchAll(): Promise<Driver[]> {
    const snapshot = await getDocs(collection(db, "drivers"));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Driver));
  }

  async fetchById(uid: string): Promise<Partial<Driver> | undefined> {
    const snapshot = await getDoc(doc(db, "drivers", uid));
    return snapshot.exists()
      ? (snapshot.data() as Partial<Driver>)
      : undefined;
  }

  async createProfile(uid: string, data: Omit<Driver, "id">): Promise<void> {
    await setDoc(doc(db, "drivers", uid), data);
  }

  async updateProfile(uid: string, data: Partial<Omit<Driver, "id">>): Promise<void> {
    await updateDoc(doc(db, "drivers", uid), data);
  }

  async softDelete(uid: string): Promise<void> {
    await updateDoc(doc(db, "drivers", uid), { deleted: true });
  }
}
