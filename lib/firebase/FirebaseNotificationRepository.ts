import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { INotificationRepository } from "@/lib/repositories/INotificationRepository";
import {
  Notification,
  NotificationType,
  CreateNotificationInput,
} from "@/types/notification";

const COLLECTION = "notifications";

/** Maps a raw Firestore document to the platform-agnostic Notification type. */
function toNotification(id: string, data: Record<string, unknown>): Notification {
  return {
    ...(data as Omit<Notification, "id" | "sent_at" | "created_at">),
    id,
    sent_at:
      data.sent_at instanceof Timestamp ? data.sent_at.toDate() : (data.sent_at as Date),
    created_at:
      data.created_at instanceof Timestamp
        ? data.created_at.toDate()
        : (data.created_at as Date),
  };
}

export class FirebaseNotificationRepository implements INotificationRepository {
  async create(data: CreateNotificationInput): Promise<string> {
    const now = new Date();
    const ref = await addDoc(collection(db, COLLECTION), {
      ...data,
      sent_at: now,
      created_at: now,
    });
    return ref.id;
  }

  async getByDriver(driverId: string, type?: NotificationType): Promise<Notification[]> {
    const constraints = [
      where("driver_id", "==", driverId),
      ...(type ? [where("type", "==", type)] : []),
      orderBy("sent_at", "desc"),
    ];
    const snap = await getDocs(query(collection(db, COLLECTION), ...constraints));
    return snap.docs.map((d) => toNotification(d.id, d.data() as Record<string, unknown>));
  }

  async getLatest(driverId: string, type?: NotificationType): Promise<Notification | null> {
    const constraints = [
      where("driver_id", "==", driverId),
      ...(type ? [where("type", "==", type)] : []),
      orderBy("sent_at", "desc"),
      limit(1),
    ];
    const snap = await getDocs(query(collection(db, COLLECTION), ...constraints));
    if (snap.empty) return null;
    const d = snap.docs[0];
    return toNotification(d.id, d.data() as Record<string, unknown>);
  }

  async resolve(id: string): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), { status: "resolved" });
  }

  async markRead(id: string): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), { read: true });
  }
}
