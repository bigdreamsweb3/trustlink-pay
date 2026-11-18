import { promises as native } from "node:fs";
export async function filesystemUnlink(state,...arguments_) { if (arguments_[0] === state.lockFile) state.unlinks.push(arguments_); return native.unlink(...arguments_); }
