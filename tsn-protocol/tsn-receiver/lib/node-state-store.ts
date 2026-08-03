import { createHash } from "node:crypto";
import { db } from "./firebase";

const root = db.collection(process.env.TSN_RECEIVER_STATE_COLLECTION ?? "tsn_receiver_state");
const id = (value: string) => createHash("sha256").update(value).digest("hex");
const bucket = (key: string) => root.doc(id(key));
const item = (key: string, field: string) => bucket(key).collection("items").doc(id(field));

export async function executeStateOperation(body: Record<string, unknown>) {
  const operation = String(body.operation ?? "");
  const key = String(body.key ?? "");
  const field = body.field == null ? null : String(body.field);
  if (!key) throw new Error("STATE_KEY_REQUIRED");
  if (operation === "get") {
    const snapshot = await bucket(key).get();
    return { value: snapshot.exists ? snapshot.get("value") ?? null : null };
  }
  if (operation === "set") {
    await bucket(key).set({ key, value: String(body.value ?? "") });
    return { ok: true };
  }
  if (operation === "hget") {
    if (!field) throw new Error("STATE_FIELD_REQUIRED");
    const snapshot = await item(key, field).get();
    return { value: snapshot.exists ? snapshot.get("value") ?? null : null };
  }
  if (operation === "hgetall") {
    const snapshot = await bucket(key).collection("items").get();
    return {
      values: Object.fromEntries(snapshot.docs.map((document) => [
        String(document.get("field")),
        document.get("value"),
      ])),
    };
  }
  if (operation === "hset") {
    const mapping = body.mapping as Record<string, unknown> | undefined;
    if (mapping) {
      const batch = db.batch();
      for (const [entryField, value] of Object.entries(mapping)) {
        batch.set(item(key, entryField), { field: entryField, value: String(value) });
      }
      await batch.commit();
    } else {
      if (!field) throw new Error("STATE_FIELD_REQUIRED");
      await item(key, field).set({ field, value: String(body.value ?? "") });
    }
    return { ok: true };
  }
  if (operation === "consume_once") {
    if (!field) throw new Error("STATE_FIELD_REQUIRED");
    const reference = item(key, field);
    const consumed = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists) return false;
      transaction.create(reference, { field, value: String(body.value ?? "") });
      return true;
    });
    return { consumed };
  }
  if (operation === "delete") {
    const keys = Array.isArray(body.keys) ? body.keys.map(String) : [key];
    for (const entryKey of keys) {
      const reference = bucket(entryKey);
      const children = await reference.collection("items").get();
      const batch = db.batch();
      children.docs.forEach((document) => batch.delete(document.ref));
      batch.delete(reference);
      await batch.commit();
    }
    return { ok: true };
  }
  throw new Error("STATE_OPERATION_INVALID");
}
