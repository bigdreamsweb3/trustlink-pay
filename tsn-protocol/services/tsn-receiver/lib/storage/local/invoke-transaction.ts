import { Tx } from "./tx";
import type { Database } from "./types";
export async function invokeTransaction<T>(operation: (transaction: Tx) => Promise<T>, data: Database): Promise<T> { return operation(new Tx(data)); }
