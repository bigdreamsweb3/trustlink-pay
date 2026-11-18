import { readAfterRelease } from "./read-after-release.mjs";
export function startDetachedRead(state, data) {
  data["scheduler-state"].row.version = 1;
  state.child = readAfterRelease(state);
}
