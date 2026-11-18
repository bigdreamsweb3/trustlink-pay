import { buildJournal } from "./build-journal";
import { validateJournal } from "./validate-journal";
import { writeAtomicFile } from "./write-atomic-file";
import { recoverJournal } from "./recover-journal";
import { validateStorageDirectory } from "./validate-storage-directory";
import type { Database, LoadedStore, StorageContext } from "./types";
export async function commitSnapshot(context: StorageContext, data: Database, before: LoadedStore): Promise<void> {
  const journal = validateJournal(context, buildJournal(context, data, before));
  if (journal.writes.length === 0 && journal.deletes.length === 0 && JSON.stringify(journal.manifest) === JSON.stringify(before.manifest)) return;
  await validateStorageDirectory(context);
  await writeAtomicFile(context, context.journalFile, JSON.stringify(journal, null, 2));
  await recoverJournal(context);
}
