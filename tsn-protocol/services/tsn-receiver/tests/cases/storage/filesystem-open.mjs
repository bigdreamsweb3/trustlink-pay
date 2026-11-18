import { promises as native } from "node:fs";
export async function filesystemOpen(state,...arguments_) {
  if (arguments_[0] === state.lockFile && arguments_[1] === "wx") {
    state.opens.push(arguments_);
    const code = state.openFailures.shift();
    if (code) throw Object.assign(new Error("injected lock open failure"),{code});
  }
  return native.open(...arguments_);
}
