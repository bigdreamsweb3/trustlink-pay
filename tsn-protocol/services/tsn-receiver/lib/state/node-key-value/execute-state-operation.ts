import type { Dependencies } from "./dependencies";
import { bucket } from "./bucket";
import { item } from "./item";
import { stateFieldEntry } from "./state-field-entry";
import { consumeStateField } from "./consume-state-field";
import { claimStateField } from "./claim-state-field";
import { deleteStateChild } from "./delete-state-child";

/** executeStateOperation component. Inputs and results retain the original node-state-store contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function executeStateOperation(dependencies: Pick<Dependencies, "database" | "root">, body: Record<string, unknown>) {
  const operation = String(body.operation ?? "");
  const key = String(body.key ?? "");
  const field = body.field == null ? null : String(body.field);
  if (!key) throw new Error("STATE_KEY_REQUIRED");
  if (operation === "get") {
    const snapshot = await bucket(dependencies, key).get();
    return { value: snapshot.exists ? snapshot.get("value") ?? null : null };
  }
  if (operation === "set") {
    await bucket(dependencies, key).set({ key, value: String(body.value ?? "") });
    return { ok: true };
  }
  if (operation === "hget") {
    if (!field) throw new Error("STATE_FIELD_REQUIRED");
    const snapshot = await item(dependencies, key, field).get();
    return { value: snapshot.exists ? snapshot.get("value") ?? null : null };
  }
  if (operation === "hgetall") {
    const snapshot = await bucket(dependencies, key).collection("items").get();
    return {
      values: Object.fromEntries(snapshot.docs.map(stateFieldEntry)),
    };
  }
  if (operation === "hset") {
    const mapping = body.mapping as Record<string, unknown> | undefined;
    if (mapping) {
      const batch = dependencies.database.batch();
      for (const [entryField, value] of Object.entries(mapping)) {
        batch.set(item(dependencies, key, entryField), { field: entryField, value: String(value) });
      }
      await batch.commit();
    } else {
      if (!field) throw new Error("STATE_FIELD_REQUIRED");
      await item(dependencies, key, field).set({ field, value: String(body.value ?? "") });
    }
    return { ok: true };
  }
  if (operation === "claim_once") {
    if (!field) throw new Error("STATE_FIELD_REQUIRED");
    if (typeof body.value !== "string" || !body.value) throw new Error("STATE_CLAIM_VALUE_REQUIRED");
    const reference = item(dependencies, key, field);
    const claimed = await dependencies.database.runTransaction(claimStateField.bind(null, { reference, field, value: body.value }));
    return { claimed };
  }
  if (operation === "consume_once") {
    if (!field) throw new Error("STATE_FIELD_REQUIRED");
    const reference = item(dependencies, key, field);
    const consumed = await dependencies.database.runTransaction(consumeStateField.bind(null, { reference, field, body }));
    return { consumed };
  }
  if (operation === "delete") {
    const keys = Array.isArray(body.keys) ? body.keys.map(String) : [key];
    for (const entryKey of keys) {
      const reference = bucket(dependencies, entryKey);
      const children = await reference.collection("items").get();
      const batch = dependencies.database.batch();
      children.docs.forEach(deleteStateChild.bind(null, { batch }));
      batch.delete(reference);
      await batch.commit();
    }
    return { ok: true };
  }
  throw new Error("STATE_OPERATION_INVALID");
}
