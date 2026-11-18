import { loadSnapshot } from "./load-snapshot";
import { commitSnapshot } from "./commit-snapshot";
import type { Database, StorageContext } from "./types";
export async function performMutation<T>(context: StorageContext, operation: (data: Database) => Promise<T> | T): Promise<T> {
  const loaded = await loadSnapshot(context);
  const result = await operation(loaded.data);
  await commitSnapshot(context, loaded.data, loaded);
  return result;
}
