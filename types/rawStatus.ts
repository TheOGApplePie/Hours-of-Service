/** A duty status entry as stored in Firestore (no mapped_time field). */
export type RawStatus = {
  type: string;
  time_of_event: { hour: number; minute: number };
};
