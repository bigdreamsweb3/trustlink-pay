import { promises as native } from "node:fs";
export async function filesystemStat(state,...arguments_) { if (arguments_[0] === state.lockFile) state.stats.push(arguments_); return native.stat(...arguments_); }
