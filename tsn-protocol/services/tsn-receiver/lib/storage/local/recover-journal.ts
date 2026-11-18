import { validateJournal } from "./validate-journal";
import { resolveRecordPath } from "./resolve-record-path";
import { writeAtomicFile } from "./write-atomic-file";
import { validateJournalRecords } from "./validate-journal-records";
import { validateStorageDirectory } from "./validate-storage-directory";
import type { StorageContext } from "./types";
/** Published journal is the logical commit; all locked readers roll it forward before visibility. */
export async function recoverJournal(context: StorageContext): Promise<void> {
  await validateStorageDirectory(context);
  let raw;
  try { raw = await context.fs.readFile(context.journalFile, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw new Error("TSN_RECEIVER_LOCAL_JOURNAL_INVALID", { cause: error }); }
  let journal;
  try { journal = validateJournal(context, JSON.parse(raw)); await validateJournalRecords(context, journal); }
  catch (error) { throw new Error("TSN_RECEIVER_LOCAL_JOURNAL_INVALID", { cause: error }); }
  try {
    for (const write of journal.writes) await writeAtomicFile(context, resolveRecordPath(context, write.path), JSON.stringify(write.row, null, 2));
    await writeAtomicFile(context, context.file, JSON.stringify(journal.manifest, null, 2));
    for (const relative of journal.deletes) {
      try { await context.fs.unlink(resolveRecordPath(context, relative)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    await context.fs.unlink(context.journalFile);
  } catch (error) {
    throw new Error("TSN_RECEIVER_LOCAL_STORE_RECOVERY_REQUIRED", { cause: error });
  }
}
