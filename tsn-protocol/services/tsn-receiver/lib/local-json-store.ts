/** Stable local Firestore facade; implementation ownership lives in storage/local. */
import { LocalDb } from "./storage/local/local-db";
export { LocalDb } from "./storage/local/local-db";
export const localDb = new LocalDb();
