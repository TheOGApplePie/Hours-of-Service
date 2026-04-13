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
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { IHosRepository } from "@/lib/repositories/IHosRepository";
import { DailyDocument } from "@/types/dailyDocument";

const HOS_COLLECTION = "hours_of_service";

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

/** Converts a Firestore document's data fields to a typed DailyDocument. */
function toDocument(id: string, data: Record<string, unknown>): DailyDocument {
  return {
    ...(data as Omit<DailyDocument, "id" | "created_at" | "updated_at">),
    id,
    created_at:
      data.created_at instanceof Timestamp
        ? data.created_at.toDate()
        : data.created_at instanceof Date
          ? data.created_at
          : new Date(),
    updated_at:
      data.updated_at instanceof Timestamp
        ? data.updated_at.toDate()
        : data.updated_at instanceof Date
          ? data.updated_at
          : new Date(),
  };
}

export class FirebaseHosRepository implements IHosRepository {
  async fetchOne(driverId: string, date: string): Promise<DailyDocument | undefined> {
    const snap = await getDocs(
      query(
        collection(db, HOS_COLLECTION),
        where("driver_id", "==", driverId),
        where("date_of_document", "==", date),
        limit(1),
      ),
    );
    if (snap.empty) return undefined;
    const d = snap.docs[0];
    return toDocument(d.id, d.data() as Record<string, unknown>);
  }

  async fetchForDates(driverId: string, dates: string[]): Promise<DailyDocument[]> {
    if (!dates.length) return [];
    const snap = await getDocs(
      query(
        collection(db, HOS_COLLECTION),
        where("driver_id", "==", driverId),
        where("date_of_document", "in", dates),
      ),
    );
    return snap.docs.map((d) => toDocument(d.id, d.data() as Record<string, unknown>));
  }

  async fetchLatestBefore(driverId: string, beforeDate: string): Promise<DailyDocument | undefined> {
    const snap = await getDocs(
      query(
        collection(db, HOS_COLLECTION),
        where("driver_id", "==", driverId),
        where("date_of_document", "<", beforeDate),
        orderBy("date_of_document", "desc"),
        limit(1),
      ),
    );
    if (snap.empty) return undefined;
    const d = snap.docs[0];
    return toDocument(d.id, d.data() as Record<string, unknown>);
  }

  async fetchForDrivers(driverIds: string[], dates?: string[]): Promise<DailyDocument[]> {
    if (!driverIds.length) return [];

    const driverChunks = chunkArray(driverIds, 30);
    const allDocs: DailyDocument[] = [];

    if (dates?.length) {
      // Filter by both drivers and dates at Firestore level (bulk export path)
      const dateChunks = chunkArray(dates, 30);
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
            snap.docs.forEach((d) =>
              allDocs.push(toDocument(d.id, d.data() as Record<string, unknown>)),
            );
          }),
        ),
      );
    } else {
      // Fetch all docs for drivers; caller applies date filtering (dashboard path)
      await Promise.all(
        driverChunks.map(async (chunk) => {
          const snap = await getDocs(
            query(collection(db, HOS_COLLECTION), where("driver_id", "in", chunk)),
          );
          snap.docs.forEach((d) =>
            allDocs.push(toDocument(d.id, d.data() as Record<string, unknown>)),
          );
        }),
      );
    }

    return allDocs;
  }

  async save(document: DailyDocument): Promise<void> {
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
        created_at: document.created_at,
      });
    } else {
      await addDoc(collection(db, HOS_COLLECTION), {
        ...payload,
        created_at: new Date(),
      });
    }
  }
}
