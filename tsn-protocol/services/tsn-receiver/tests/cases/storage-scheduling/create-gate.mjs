import { captureGate } from "./capture-gate.mjs";
export function createGate() {
  const gate = {};
  gate.promise = new Promise(captureGate.bind(null, gate));
  return gate;
}
