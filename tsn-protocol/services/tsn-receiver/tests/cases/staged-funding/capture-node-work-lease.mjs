/** Record the authenticated route's exact filter without allocating any operator storage. */
export async function captureNodeWorkLease(calls, owner, supportedKinds, fundingPhase) {
  calls.push({ owner, supportedKinds, fundingPhase });
  return null;
}
