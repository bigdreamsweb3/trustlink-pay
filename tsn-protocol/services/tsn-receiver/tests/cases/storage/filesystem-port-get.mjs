import { promises as native } from "node:fs";
import { filesystemOpen } from "./filesystem-open.mjs";
import { filesystemRename } from "./filesystem-rename.mjs";
import { filesystemUnlink } from "./filesystem-unlink.mjs";
import { filesystemStat } from "./filesystem-stat.mjs";
export function filesystemPortGet(state,target,property) {
  if (property === "open") return filesystemOpen.bind(null,state);
  if (property === "rename") return filesystemRename.bind(null,state);
  if (property === "unlink") return filesystemUnlink.bind(null,state);
  if (property === "stat") return filesystemStat.bind(null,state);
  return Reflect.get(native,property);
}
