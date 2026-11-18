import { mutateStore } from "./mutate-store";
import { invokeTransaction } from "./invoke-transaction";
import type { LocalDb } from "./local-db";
import type { Tx } from "./tx";
export async function dbRunTransaction<T>(this: LocalDb, operation: (transaction: Tx) => Promise<T>): Promise<T> { return mutateStore(this.context, invokeTransaction.bind(null,operation)) as Promise<T>; }
