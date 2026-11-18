/** Capture only control notifications in the case's isolated state. */
export async function captureWake(target, reason) {
  target.push(reason);
}
