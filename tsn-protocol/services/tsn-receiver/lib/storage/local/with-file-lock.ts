import { queueOperation } from "./queue-operation";
import { runFileLockedOperation } from "./run-file-locked-operation";
import type { StorageContext } from "./types";
/** Queue all local contenders fairly before retaining the cross-worker filesystem lock. */
export async function withFileLock<T>(context: StorageContext, operation: () => Promise<T>): Promise<T> {
  return queueOperation(context, (runFileLockedOperation<T>).bind(null, context, operation));
}
