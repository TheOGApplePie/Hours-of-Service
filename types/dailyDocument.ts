/** A single duty status entry as stored in Firestore, with a UI-friendly mapped_time field. */
export interface Status {
  type: string;
  time_of_event: { hour: number; minute: number };
  /** HH:mm string derived from time_of_event — used to populate time inputs in the form. */
  mapped_time: string;
}

/** A daily Hours of Service document as stored in Firestore. */
export interface DailyDocument {
  id: string;
  /** ISO date string (yyyy-MM-dd). */
  date_of_document: string;
  driver_id: string;
  parking_location: string;
  comments: string;
  statuses: Status[];
  created_at: { seconds: number; nanoseconds: number };
  updated_at: Date;
}
