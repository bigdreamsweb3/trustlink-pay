import assert from "node:assert/strict";
import { access } from "node:fs/promises";
export async function lockedOperation(state,lockFile) { state.operationCount += 1; await access(lockFile); return "acquired"; }
