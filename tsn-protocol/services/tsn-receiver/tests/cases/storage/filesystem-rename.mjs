import { promises as native } from "node:fs";
export async function filesystemRename(state,source,target) {
  if (state.failJournalRename && String(target).endsWith("transaction.json")) throw Object.assign(new Error("injected journal publish failure"),{code:"EIO"});
  if (String(target).includes(".d") && /[\\/]epochs[\\/]/.test(String(target))) {
    state.recordRenames += 1;
    if (state.failRecordRenameAt === state.recordRenames) throw Object.assign(new Error("injected record swap failure"),{code:"EIO"});
  }
  if (state.failManifestRename && target === state.file) throw Object.assign(new Error("injected manifest swap failure"),{code:"EIO"});
  return native.rename(source,target);
}
