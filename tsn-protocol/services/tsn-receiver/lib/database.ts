/** Canonical production storage is D1 JSON. The file adapter is explicitly isolated and never a hosted fallback. */
import { RecordDb } from "./storage/record-store/database";
import { recordStoreCommand } from "./storage/record-store/command";
import { localDb } from "./local-json-store";
const mode = process.env.TSN_RECEIVER_STORE ?? "d1";
if (!["d1","file"].includes(mode)) throw new Error("TSN_RECEIVER_STORAGE_MODE_RETIRED");
if (mode === "file" && (process.env.TSN_ALLOW_LOCAL_JSON_STORE !== "true" || process.env.VERCEL)) throw new Error("TSN_RECEIVER_FILE_STORE_ISOLATED_ONLY");
const db: any = mode === "file" ? localDb : new RecordDb(recordStoreCommand(process.env), process.env.TSN_RECORD_STORE_NAMESPACE ?? "tsn-receiver");
const workCollection = db.collection(process.env.TSN_RECEIVER_COLLECTION ?? "tsn_receiver_work");
export { db, workCollection };
